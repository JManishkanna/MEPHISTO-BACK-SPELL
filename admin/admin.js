const authPanel = document.getElementById("admin-login-panel");
const dashboard = document.getElementById("admin-dashboard");
const loginForm = document.getElementById("admin-login-form");
const authStatus = document.getElementById("admin-auth-status");
const dashboardStatus = document.getElementById("admin-status");
const adminSectionLinks = [...document.querySelectorAll(".admin-section-nav a")];
const adminSections = [...document.querySelectorAll("[data-admin-section]")];
const projectForm = document.getElementById("project-form");
const projectList = document.getElementById("admin-project-list");
const imageInput = document.getElementById("project-image");
const imageUrlInput = document.getElementById("project-image-url");
const deleteButton = document.getElementById("delete-project");
const socialLinkForm = document.getElementById("social-link-form");
const socialLinkList = document.getElementById("admin-social-link-list");
const skillForm = document.getElementById("skill-form");
const toolForm = document.getElementById("tool-form");
const catalogForms = {
  skill: skillForm,
  tool: toolForm
};
const catalogLists = {
  skill: document.getElementById("admin-skill-list"),
  tool: document.getElementById("admin-tool-list")
};
const resumeForm = document.getElementById("resume-upload-form");
const resumeFileInput = document.getElementById("resume-file");
const resumeStatus = document.getElementById("resume-status");
const resumeCurrentLink = document.getElementById("resume-current-link");
const resumeUploadButton = document.getElementById("resume-upload-button");
const resumeDeleteButton = document.getElementById("resume-delete-button");
const config = window.PORTFOLIO_SUPABASE_CONFIG;

const resumeBucket = "portfolio-resumes";
const resumeMaxSize = 10 * 1024 * 1024;
let client = null;
let projects = [];
let socialLinks = [];
let catalogItems = { skill: [], tool: [] };
let currentResumeUrl = "";
let selectedSlug = "";
let selectedSocialLinkId = "";
let selectedCatalogIds = { skill: "", tool: "" };
let chatConversations = [];
let selectedChatConversationId = "";
let latestAdminChatMessageId = "";
let latestAdminChatProfileSignature = "";
let chatInboxTimer = null;
let chatPresenceTimer = null;
let chatGroups = [];
let selectedChatGroupId = "";
let latestAdminGroupMessageId = "";
let latestAdminGroupProfileSignature = "";

const chatAttachmentBucket = "chat-attachments";
const chatAttachmentMaxSize = 10 * 1024 * 1024;
const chatAttachmentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);

function activateAdminSection(sectionId) {
  const activeId = adminSections.some((section) => section.dataset.adminSection === sectionId)
    ? sectionId
    : adminSections[0]?.dataset.adminSection;

  adminSections.forEach((section) => {
    section.hidden = section.dataset.adminSection !== activeId;
  });
  adminSectionLinks.forEach((link) => {
    const isActive = link.hash.slice(1) === activeId;
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.dataset.error = String(isError);
}

async function loadChatProfiles(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) {
    return new Map();
  }
  const { data, error } = await client
    .from("chat_profiles")
    .select("user_id, display_name")
    .in("user_id", ids);
  if (error) {
    throw error;
  }
  return new Map((data || []).map((profile) => [profile.user_id, profile.display_name]));
}

async function loadChatPresence(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) {
    return new Map();
  }
  const { data, error } = await client.rpc("get_chat_presence", {
    p_user_ids: ids
  });
  if (error) {
    throw error;
  }
  return new Map((data || []).map((presence) => [presence.user_id, presence.last_seen_at]));
}

function isChatUserOnline(lastSeenAt) {
  const lastSeenTime = Date.parse(lastSeenAt || "");
  return Number.isFinite(lastSeenTime) && Date.now() - lastSeenTime >= 0 && Date.now() - lastSeenTime < 90000;
}

function createChatPresenceIndicator(isOnline) {
  const indicator = previewElement("span", `chat-online-indicator${isOnline ? " is-online" : ""}`, isOnline ? "Online" : "Offline");
  indicator.setAttribute("aria-label", isOnline ? "User is online" : "User is offline");
  const dot = document.createElement("span");
  dot.className = "chat-online-dot";
  dot.setAttribute("aria-hidden", "true");
  indicator.prepend(dot);
  return indicator;
}

function bindChatFileName(inputId, nameId) {
  const input = document.getElementById(inputId);
  const name = document.getElementById(nameId);
  input.addEventListener("change", () => {
    name.textContent = input.files?.[0]?.name || "";
  });
}

bindChatFileName("admin-chat-file", "admin-chat-file-name");
bindChatFileName("admin-group-file", "admin-group-file-name");

async function renderChatMessages(messages, currentUserId, conversationId, visitorDisplayName) {
  const container = document.getElementById("admin-chat-messages");
  if (!messages.length) {
    const empty = previewElement("p", "admin-chat-empty", "No messages in this conversation yet.");
    container.replaceChildren(empty);
    latestAdminChatMessageId = "";
    return;
  }

  const newestId = messages[messages.length - 1].id;
  const profileSignature = `${conversationId}:${visitorDisplayName}`;
  if (newestId === latestAdminChatMessageId
    && profileSignature === latestAdminChatProfileSignature
    && container.childElementCount) {
    return;
  }
  latestAdminChatMessageId = newestId;
  latestAdminChatProfileSignature = profileSignature;

  const fragment = document.createDocumentFragment();
  for (const message of messages) {
    const item = previewElement("article", `admin-chat-message${message.sender_id === currentUserId ? " is-own" : ""}`);
    const author = previewElement("strong", "", message.sender_id === currentUserId ? "You" : visitorDisplayName);
    item.append(author);
    if (message.body) {
      item.append(previewElement("p", "", message.body));
    }
    if (message.attachment_path) {
      const { data, error } = await client.storage
        .from(chatAttachmentBucket)
        .createSignedUrl(message.attachment_path, 3600);
      if (selectedChatConversationId !== conversationId) {
        return;
      }
      if (data?.signedUrl && !error) {
        const link = previewElement("a", "admin-chat-attachment", message.attachment_name || "Download attachment");
        link.href = data.signedUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        item.append(link);
        if (/\.(?:jpe?g|png|gif|webp)$/i.test(message.attachment_name || "")) {
          const image = document.createElement("img");
          image.src = data.signedUrl;
          image.alt = message.attachment_name || "Chat attachment";
          image.loading = "lazy";
          image.className = "admin-chat-image";
          item.append(image);
        }
      } else {
        item.append(previewElement("p", "admin-chat-attachment", message.attachment_name || "Attachment unavailable"));
      }
    }
    const time = document.createElement("time");
    time.dateTime = message.created_at;
    time.textContent = new Date(message.created_at).toLocaleString();
    item.append(time);
    fragment.append(item);
  }
  if (selectedChatConversationId !== conversationId) {
    return;
  }
  container.replaceChildren(fragment);
  container.scrollTop = container.scrollHeight;
}

async function loadSelectedChatMessages() {
  const form = document.getElementById("admin-chat-reply-form");
  const heading = document.getElementById("chat-thread-heading");
  const conversation = chatConversations.find((item) => item.id === selectedChatConversationId);
  if (!conversation) {
    heading.textContent = "Select a conversation";
    form.hidden = true;
    document.getElementById("admin-chat-messages").replaceChildren();
    latestAdminChatMessageId = "";
    return;
  }

  heading.textContent = `${conversation.display_name} (${conversation.visitor_email}) · ${conversation.is_online ? "Online" : "Offline"}`;
  form.hidden = false;
  const conversationId = conversation.id;
  const { data, error } = await client
    .from("chat_messages")
    .select("id, sender_id, body, attachment_path, attachment_name, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    throw error;
  }
  const { data: userData } = await client.auth.getUser();
  if (selectedChatConversationId !== conversationId) {
    return;
  }
  await renderChatMessages((data || []).reverse(), userData?.user?.id, conversationId, conversation.display_name);
}

async function loadChatInbox() {
  const status = document.getElementById("chat-inbox-status");
  const list = document.getElementById("chat-conversation-list");
  const { data, error } = await client
    .from("chat_conversations")
    .select("id, visitor_id, visitor_email, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) {
    setStatus(status, `Chat is not set up yet. Run supabase/chat-migration.sql in the Supabase SQL Editor. Details: ${error.message}`, true);
    return;
  }
  chatConversations = data || [];
  try {
    const profileNames = await loadChatProfiles(chatConversations.map((conversation) => conversation.visitor_id));
    chatConversations.forEach((conversation) => {
      conversation.display_name = profileNames.get(conversation.visitor_id)
        || conversation.visitor_email.split("@")[0]
        || "Visitor";
    });
  } catch (profileError) {
    setStatus(status, `Could not load visitor display names: ${profileError.message}`, true);
    return;
  }
  let presenceErrorMessage = "";
  try {
    const presenceByUserId = await loadChatPresence(chatConversations.map((conversation) => conversation.visitor_id));
    chatConversations.forEach((conversation) => {
      conversation.is_online = isChatUserOnline(presenceByUserId.get(conversation.visitor_id));
    });
  } catch (presenceError) {
    console.error(presenceError);
    presenceErrorMessage = ` Online status unavailable: ${presenceError.message}`;
  }
  if (!chatConversations.length) {
    selectedChatConversationId = "";
  } else if (!chatConversations.some((conversation) => conversation.id === selectedChatConversationId)) {
    selectedChatConversationId = chatConversations[0].id;
    latestAdminChatMessageId = "";
  }

  const latestMessages = new Map();
  if (chatConversations.length) {
    const { data: messages, error: messageError } = await client
      .from("chat_messages")
      .select("conversation_id, body, attachment_name, created_at")
      .in("conversation_id", chatConversations.map((conversation) => conversation.id))
      .order("created_at", { ascending: false })
      .limit(500);
    if (messageError) {
      setStatus(status, `Could not load chat previews: ${messageError.message}`, true);
      return;
    }
    (messages || []).forEach((message) => {
      if (!latestMessages.has(message.conversation_id)) {
        latestMessages.set(message.conversation_id, message);
      }
    });
  }

  list.replaceChildren();
  chatConversations.forEach((conversation) => {
    const button = previewElement("button", "admin-chat-conversation");
    button.type = "button";
    button.classList.toggle("active", conversation.id === selectedChatConversationId);
    const name = previewElement("strong", "", conversation.display_name);
    const email = previewElement("span", "", conversation.visitor_email);
    const preview = previewElement("span", "", latestMessages.get(conversation.id)?.body || latestMessages.get(conversation.id)?.attachment_name || "No messages yet");
    button.append(name, email, preview, createChatPresenceIndicator(Boolean(conversation.is_online)));
    button.addEventListener("click", async () => {
      selectedChatConversationId = conversation.id;
      latestAdminChatMessageId = "";
      await loadChatInbox();
    });
    list.append(button);
  });
  if (!chatConversations.length) {
    list.append(previewElement("p", "admin-chat-empty", "No visitor conversations yet."));
  }

  setStatus(
    status,
    `${chatConversations.length} conversation${chatConversations.length === 1 ? "" : "s"}. Inbox refreshes automatically.${presenceErrorMessage}`,
    Boolean(presenceErrorMessage)
  );
  try {
    await loadSelectedChatMessages();
  } catch (messageError) {
    setStatus(status, `Could not load conversation messages: ${messageError.message}`, true);
  }
  await loadChatGroups();
}

async function loadChatGroups() {
  const status = document.getElementById("chat-group-status");
  const list = document.getElementById("chat-group-list");
  const { data, error } = await client
    .from("chat_groups")
    .select("id, name, created_by, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) {
    setStatus(status, `Could not load group rooms: ${error.message}`, true);
    return;
  }

  chatGroups = data || [];
  if (!chatGroups.some((group) => group.id === selectedChatGroupId)) {
    selectedChatGroupId = chatGroups[0]?.id || "";
    latestAdminGroupMessageId = "";
  }

  const latestMessages = new Map();
  if (chatGroups.length) {
    const { data: messages, error: messageError } = await client
      .from("chat_group_messages")
      .select("group_id, body, attachment_name, created_at")
      .in("group_id", chatGroups.map((group) => group.id))
      .order("created_at", { ascending: false })
      .limit(500);
    if (messageError) {
      setStatus(status, `Could not load group previews: ${messageError.message}`, true);
      return;
    }
    (messages || []).forEach((message) => {
      if (!latestMessages.has(message.group_id)) {
        latestMessages.set(message.group_id, message);
      }
    });
  }

  list.replaceChildren();
  chatGroups.forEach((group) => {
    const button = previewElement("button", "admin-chat-conversation");
    button.type = "button";
    button.classList.toggle("active", group.id === selectedChatGroupId);
    const name = previewElement("strong", "", group.name);
    const previewMessage = latestMessages.get(group.id);
    const preview = previewElement("span", "", previewMessage?.body || previewMessage?.attachment_name || group.id);
    const inviteId = previewElement("span", "admin-chat-group-id", group.id);
    button.append(name, preview, inviteId);
    button.addEventListener("click", async () => {
      selectedChatGroupId = group.id;
      latestAdminGroupMessageId = "";
      await loadChatGroups();
    });
    list.append(button);
  });
  if (!chatGroups.length) {
    list.append(previewElement("p", "admin-chat-empty", "No group rooms yet."));
    selectedChatGroupId = "";
  }
  setStatus(status, `${chatGroups.length} group room${chatGroups.length === 1 ? "" : "s"}.`);

  const selectedGroup = chatGroups.find((group) => group.id === selectedChatGroupId);
  await loadSelectedChatGroup(selectedGroup);
}

async function loadSelectedChatGroup(group) {
  const heading = document.getElementById("chat-group-thread-heading");
  const inviteId = document.getElementById("chat-group-id");
  const copyButton = document.getElementById("copy-chat-group-id");
  const membersContainer = document.getElementById("chat-group-members");
  const form = document.getElementById("admin-group-reply-form");
  const messageContainer = document.getElementById("admin-group-messages");
  if (!group) {
    heading.textContent = "Select a group room";
    inviteId.textContent = "Select a room";
    copyButton.disabled = true;
    membersContainer.replaceChildren(previewElement("p", "admin-chat-empty", "No room selected."));
    form.hidden = true;
    messageContainer.replaceChildren();
    latestAdminGroupMessageId = "";
    return;
  }

  heading.textContent = group.name;
  inviteId.textContent = group.id;
  copyButton.disabled = false;
  form.hidden = false;

  const { data: members, error: membersError } = await client
    .from("chat_group_members")
    .select("member_id, joined_at")
    .eq("group_id", group.id)
    .order("joined_at", { ascending: true });
  if (membersError) {
    setStatus(document.getElementById("chat-group-status"), `Could not load room members: ${membersError.message}`, true);
    return;
  }
  let memberNames;
  let memberPresence;
  try {
    memberNames = await loadChatProfiles((members || []).map((member) => member.member_id));
    memberPresence = await loadChatPresence((members || []).map((member) => member.member_id));
  } catch (profileError) {
    setStatus(document.getElementById("chat-group-status"), `Could not load group member details: ${profileError.message}`, true);
    return;
  }
  membersContainer.replaceChildren();
  if (!members?.length) {
    membersContainer.append(previewElement("p", "admin-chat-empty", "No members have joined yet."));
  } else {
    members.forEach((member) => {
      const row = previewElement("div", "admin-group-member");
      const memberName = memberNames.get(member.member_id) || "Visitor";
      const name = previewElement("span", "admin-group-member-name", memberName);
      const isOnline = isChatUserOnline(memberPresence.get(member.member_id));
      row.append(name, createChatPresenceIndicator(isOnline));
      const removeButton = previewElement("button", "", "Remove");
      removeButton.type = "button";
      removeButton.setAttribute("aria-label", `Remove member ${memberName}`);
      removeButton.addEventListener("click", async () => {
        const { error } = await client
          .from("chat_group_members")
          .delete()
          .eq("group_id", group.id)
          .eq("member_id", member.member_id);
        if (error) {
          setStatus(document.getElementById("chat-group-status"), `Could not remove member: ${error.message}`, true);
          return;
        }
        await loadSelectedChatGroup(group);
      });
      row.append(removeButton);
      membersContainer.append(row);
    });
  }

  const { data: messages, error: messagesError } = await client
    .from("chat_group_messages")
    .select("id, group_id, sender_id, body, attachment_path, attachment_name, created_at")
    .eq("group_id", group.id)
    .order("created_at", { ascending: false })
    .limit(500);
  if (messagesError) {
    setStatus(document.getElementById("chat-group-status"), `Could not load room messages: ${messagesError.message}`, true);
    return;
  }
  const { data: userData } = await client.auth.getUser();
  if (selectedChatGroupId !== group.id) {
    return;
  }
  const orderedMessages = (messages || []).reverse();
  let profileNames = memberNames;
  try {
    const messageNames = await loadChatProfiles(orderedMessages.map((message) => message.sender_id));
    profileNames = new Map([...memberNames, ...messageNames]);
  } catch (profileError) {
    setStatus(document.getElementById("chat-group-status"), `Could not load message sender names: ${profileError.message}`, true);
    return;
  }
  if (selectedChatGroupId !== group.id) {
    return;
  }
  await renderChatGroupMessages(orderedMessages, userData?.user?.id, group.id, profileNames);
}

async function renderChatGroupMessages(messages, currentUserId, groupId, profileNames) {
  const container = document.getElementById("admin-group-messages");
  if (!messages.length) {
    container.replaceChildren(previewElement("p", "admin-chat-empty", "No messages in this room yet."));
    latestAdminGroupMessageId = "";
    latestAdminGroupProfileSignature = "";
    return;
  }
  const newestId = messages[messages.length - 1].id;
  const profileSignature = `${groupId}|${[...profileNames.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, name]) => `${id}:${name}`).join("|")}`;
  if (newestId === latestAdminGroupMessageId
    && profileSignature === latestAdminGroupProfileSignature
    && container.childElementCount) {
    return;
  }
  latestAdminGroupMessageId = newestId;
  latestAdminGroupProfileSignature = profileSignature;

  const fragment = document.createDocumentFragment();
  for (const message of messages) {
    const item = previewElement("article", `admin-chat-message${message.sender_id === currentUserId ? " is-own" : ""}`);
    item.append(previewElement("strong", "", message.sender_id === currentUserId ? "You" : (profileNames.get(message.sender_id) || "Member")));
    if (message.body) {
      item.append(previewElement("p", "", message.body));
    }
    if (message.attachment_path) {
      const { data, error } = await client.storage
        .from(chatAttachmentBucket)
        .createSignedUrl(message.attachment_path, 3600);
      if (selectedChatGroupId !== groupId) {
        return;
      }
      if (data?.signedUrl && !error) {
        const link = previewElement("a", "admin-chat-attachment", message.attachment_name || "Download attachment");
        link.href = data.signedUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        item.append(link);
        if (/\.(?:jpe?g|png|gif|webp)$/i.test(message.attachment_name || "")) {
          const image = document.createElement("img");
          image.src = data.signedUrl;
          image.alt = message.attachment_name || "Chat attachment";
          image.loading = "lazy";
          image.className = "admin-chat-image";
          item.append(image);
        }
      } else {
        item.append(previewElement("p", "admin-chat-attachment", message.attachment_name || "Attachment unavailable"));
      }
    }
    const time = document.createElement("time");
    time.dateTime = message.created_at;
    time.textContent = new Date(message.created_at).toLocaleString();
    item.append(time);
    fragment.append(item);
  }
  if (selectedChatGroupId !== groupId) {
    return;
  }
  container.replaceChildren(fragment);
  container.scrollTop = container.scrollHeight;
}

function previewElement(tagName, className, text = "") {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text) {
    element.textContent = text;
  }
  return element;
}

function renderGithubPagePreview() {
  const preview = document.getElementById("github-page-preview");
  if (!preview) {
    return;
  }
  preview.replaceChildren();

  const username = document.getElementById("github-username").value.trim();
  const card = previewElement("div", "admin-preview-profile-card");
  const icon = previewElement("span", "admin-preview-avatar");
  icon.append(previewElement("i", "fab fa-github"));
  const details = previewElement("div", "admin-preview-profile-details");
  details.append(
    previewElement("span", "admin-preview-eyebrow", "GitHub profile"),
    previewElement("strong", "", username ? `@${username}` : "Your GitHub username"),
    previewElement("small", "", "Repositories · activity · project stats")
  );
  card.append(icon, details);

  const link = previewElement("a", "admin-preview-link", "View GitHub profile");
  if (username) {
    link.href = `https://github.com/${encodeURIComponent(username)}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  } else {
    link.href = "#";
    link.addEventListener("click", (event) => event.preventDefault());
  }
  preview.append(card, link);
}

function renderResumePagePreview() {
  const preview = document.getElementById("resume-page-preview");
  if (!preview) {
    return;
  }
  preview.replaceChildren();

  const card = previewElement("div", "admin-preview-resume-card");
  card.append(
    previewElement("span", "admin-preview-resume-icon", "PDF"),
    previewElement("div", "admin-preview-profile-details")
  );
  const details = card.lastElementChild;
  details.append(
    previewElement("strong", "", "Resume"),
    previewElement("small", "", currentResumeUrl ? "Available to visitors" : "No resume currently published")
  );
  const link = previewElement("a", "admin-preview-link", currentResumeUrl ? "Download resume" : "Resume link hidden");
  if (currentResumeUrl) {
    link.href = currentResumeUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  } else {
    link.classList.add("is-disabled");
  }
  preview.append(card, link);
}

const previewSocialIcons = {
  github: "fab fa-github",
  linkedin: "fab fa-linkedin-in",
  instagram: "fab fa-instagram",
  leetcode: "fas fa-code",
  website: "fas fa-globe",
  youtube: "fab fa-youtube",
  x: "fab fa-x-twitter"
};

function renderSocialPagePreview() {
  const preview = document.getElementById("social-page-preview");
  if (!preview) {
    return;
  }
  preview.replaceChildren();

  const entries = [...socialLinks];
  const formData = new FormData(socialLinkForm);
  const label = String(formData.get("label") || "").trim();
  const url = String(formData.get("url") || "").trim();
  const iconKey = String(formData.get("icon_key") || "website");
  if (label) {
    const draft = {
      id: selectedSocialLinkId,
      label,
      url,
      icon_key: iconKey
    };
    const existingIndex = entries.findIndex((entry) => entry.id === selectedSocialLinkId);
    if (existingIndex >= 0) {
      entries[existingIndex] = draft;
    } else {
      entries.push(draft);
    }
  }

  const row = previewElement("div", "admin-preview-social-row");
  entries.forEach((entry) => {
    const anchor = previewElement("a", "admin-preview-social-link");
    const iconClass = previewSocialIcons[entry.icon_key];
    if (!iconClass) {
      return;
    }
    anchor.href = isHttpsUrl(entry.url) ? entry.url : "#";
    anchor.setAttribute("aria-label", entry.label);
    if (!isHttpsUrl(entry.url)) {
      anchor.addEventListener("click", (event) => event.preventDefault());
    } else {
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    }
    anchor.append(previewElement("i", iconClass), previewElement("span", "", entry.label));
    row.append(anchor);
  });
  if (!row.childElementCount) {
    row.append(previewElement("p", "admin-preview-empty", "Add social links to preview them here."));
  }
  preview.append(
    previewElement("span", "admin-preview-eyebrow", "Stay connected"),
    previewElement("h3", "admin-preview-title", "Find me online"),
    row
  );
}

function getCatalogPreviewEntries(type) {
  const entries = [...catalogItems[type]];
  const formData = new FormData(catalogForms[type]);
  const name = String(formData.get("name") || "").trim();
  if (!name) {
    return entries;
  }

  const id = selectedCatalogIds[type];
  const entry = {
    id,
    entry_type: type,
    name,
    description: type === "tool" ? String(formData.get("description") || "").trim() : "",
    status: type === "skill" ? String(formData.get("status") || "") : "",
    icon_class: String(formData.get("icon_class") || "").trim(),
    display_order: Number(formData.get("display_order")) || 0
  };
  const existingIndex = entries.findIndex((item) => item.id === id);
  if (existingIndex >= 0) {
    entries[existingIndex] = entry;
  } else {
    entries.push(entry);
  }
  entries.sort((a, b) => a.display_order - b.display_order);
  return [entry, ...entries.filter((item) => item.id !== id)].slice(0, 4);
}

function renderCatalogPagePreview(type) {
  const preview = document.getElementById(type === "skill" ? "skills-page-preview" : "tools-page-preview");
  if (!preview) {
    return;
  }
  preview.replaceChildren();

  const entries = getCatalogPreviewEntries(type).slice(0, 4);
  entries.forEach((entry) => {
    const card = previewElement("article", "admin-preview-mini-card");
    const icon = previewElement("span", "admin-preview-mini-icon");
    if (/^(fab|fas|far) fa-[a-z0-9-]+$/.test(entry.icon_class || "")) {
      icon.append(previewElement("i", entry.icon_class));
    }
    card.append(
      icon,
      previewElement("strong", "", entry.name),
      previewElement("small", "", type === "skill" ? entry.status : entry.description)
    );
    preview.append(card);
  });
  if (!entries.length) {
    preview.append(previewElement("p", "admin-preview-empty", `Add ${type}s to preview the public section.`));
  }
}

function getProjectPreviewEntries() {
  const entries = [...projects];
  const formData = new FormData(projectForm);
  const title = String(formData.get("title") || "").trim();
  if (!title) {
    return entries.slice(0, 3);
  }

  const slug = String(formData.get("slug") || "").trim();
  const entry = {
    slug,
    title,
    category: String(formData.get("category") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    technologies: String(formData.get("technologies") || "").split(",").map((item) => item.trim()).filter(Boolean),
    preview_image_url: String(formData.get("preview_image_url") || "").trim()
  };
  const existingIndex = entries.findIndex((project) => project.slug === selectedSlug || (slug && project.slug === slug));
  if (existingIndex >= 0) {
    entries[existingIndex] = entry;
  } else {
    entries.unshift(entry);
  }
  return [entry, ...entries.filter((project) => project.slug !== slug)].slice(0, 3);
}

function renderProjectsPagePreview() {
  const preview = document.getElementById("projects-page-preview");
  if (!preview) {
    return;
  }
  preview.replaceChildren();

  const entries = getProjectPreviewEntries();
  entries.forEach((project) => {
    const card = previewElement("article", "admin-preview-project-card");
    const imageUrl = project.preview_image_url || project.previewImage || "";
    if (imageUrl && (imageUrl.startsWith("assets/") || isHttpsUrl(imageUrl))) {
      const image = previewElement("img", "admin-preview-project-image");
      image.src = imageUrl;
      image.alt = "";
      image.loading = "lazy";
      card.append(image);
    }
    const details = previewElement("div", "admin-preview-project-details");
    details.append(
      previewElement("small", "admin-preview-eyebrow", project.category || "Project"),
      previewElement("strong", "", project.title),
      previewElement("p", "", project.description || "Project description will appear here.")
    );
    const technologies = previewElement("div", "admin-preview-tags");
    (project.technologies || []).slice(0, 3).forEach((technology) => {
      technologies.append(previewElement("span", "", technology));
    });
    details.append(technologies);
    card.append(details);
    preview.append(card);
  });
  if (!entries.length) {
    preview.append(previewElement("p", "admin-preview-empty", "Add a project to preview the public Projects page."));
  }
}

function showLogin(message = "") {
  dashboard.hidden = true;
  authPanel.hidden = false;
  if (message) {
    setStatus(authStatus, message, true);
  }
}

function showDashboard() {
  authPanel.hidden = true;
  dashboard.hidden = false;
  activateAdminSection(window.location.hash.slice(1));
}

window.addEventListener("hashchange", () => {
  activateAdminSection(window.location.hash.slice(1));
});

function field(name) {
  return projectForm.elements.namedItem(name);
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function resetProjectForm() {
  projectForm.reset();
  field("display_order").value = String(projects.length + 1);
  field("preview_type").value = "screenshot";
  field("slug").readOnly = false;
  selectedSlug = "";
  deleteButton.disabled = true;
  imageInput.value = "";
  projectList.querySelectorAll(".admin-project-item").forEach((item) => item.classList.remove("active"));
  document.getElementById("editor-heading").textContent = "New project";
  renderProjectsPagePreview();
}

function selectProject(project) {
  projectForm.reset();
  selectedSlug = project.slug;
  field("slug").value = project.slug;
  field("slug").readOnly = true;
  field("title").value = project.title || "";
  field("category").value = project.category || "";
  field("description").value = project.description || "";
  field("technologies").value = (project.technologies || []).join(", ");
  field("challenge").value = project.challenge || "";
  field("approach").value = project.approach || "";
  field("outcome").value = project.outcome || "";
  field("github_owner").value = project.github_owner || "";
  field("github_repo").value = project.github_repo || "";
  field("live_demo_url").value = project.live_demo_url || "";
  field("display_order").value = String(project.display_order || 0);
  field("preview_image_url").value = project.preview_image_url || "";
  field("preview_type").value = project.preview_type || "screenshot";
  imageInput.value = "";
  deleteButton.disabled = false;
  document.getElementById("editor-heading").textContent = "Edit project";
  projectList.querySelectorAll(".admin-project-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.slug === project.slug);
  });
  renderProjectsPagePreview();
}

function renderProjectList() {
  projectList.replaceChildren();
  document.getElementById("import-starter-projects").hidden = projects.length > 0;
  projects.forEach((project) => {
    const row = document.createElement("div");
    row.className = "admin-project-item-row";

    const selectButton = document.createElement("button");
    selectButton.className = "admin-project-item";
    selectButton.type = "button";
    selectButton.dataset.slug = project.slug;
    selectButton.textContent = project.title;
    selectButton.addEventListener("click", () => selectProject(project));

    const removeButton = document.createElement("button");
    removeButton.className = "admin-project-delete";
    removeButton.type = "button";
    removeButton.textContent = "Delete";
    removeButton.setAttribute("aria-label", `Delete ${project.title}`);
    removeButton.addEventListener("click", () => deleteProject(project.slug, project.title));

    row.append(selectButton, removeButton);
    projectList.append(row);
  });
  if (!projects.length) {
    const emptyState = document.createElement("p");
    emptyState.className = "admin-status";
    emptyState.textContent = "No projects are stored yet. Add one or import the starter case studies.";
    projectList.append(emptyState);
  }
  renderProjectsPagePreview();
}

async function loadProjects() {
  const { data, error } = await client
    .from("projects")
    .select("*")
    .order("display_order", { ascending: true });

  if (error) {
    throw new Error(`Could not load projects: ${error.message}`);
  }

  projects = data || [];
  renderProjectList();
}

async function loadSettings() {
  const { data, error } = await client
    .from("portfolio_settings")
    .select("github_username")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load GitHub settings: ${error.message}`);
  }

  document.getElementById("github-username").value = data?.github_username || "";
  renderGithubPagePreview();
}

function resumeStoragePath(url) {
  if (!url || !config?.url) {
    return "";
  }

  try {
    const parsedUrl = new URL(url);
    const projectUrl = new URL(config.url);
    const prefix = `/storage/v1/object/public/${resumeBucket}/`;
    if (parsedUrl.origin !== projectUrl.origin || !parsedUrl.pathname.startsWith(prefix)) {
      return "";
    }
    return decodeURIComponent(parsedUrl.pathname.slice(prefix.length));
  } catch {
    return "";
  }
}

function renderResumeSetting(url) {
  currentResumeUrl = url || "";
  resumeCurrentLink.hidden = !currentResumeUrl;
  if (currentResumeUrl) {
    resumeCurrentLink.href = currentResumeUrl;
    resumeStatus.textContent = "A resume is currently published.";
  } else {
    resumeCurrentLink.removeAttribute("href");
    resumeStatus.textContent = "No resume is currently published.";
  }
  resumeUploadButton.disabled = false;
  resumeDeleteButton.disabled = !currentResumeUrl;
  renderResumePagePreview();
}

async function loadResumeSetting() {
  const { data, error } = await client
    .from("portfolio_settings")
    .select("resume_url")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    resumeStatus.textContent = "Run supabase/resume-management-migration.sql in the Supabase SQL Editor to enable resume management.";
    resumeStatus.dataset.error = "true";
    resumeUploadButton.disabled = true;
    resumeDeleteButton.disabled = true;
    return;
  }
  if (!data) {
    resumeStatus.textContent = "Portfolio settings row was not found. Resume management is unavailable.";
    resumeStatus.dataset.error = "true";
    resumeUploadButton.disabled = true;
    resumeDeleteButton.disabled = true;
    return;
  }
  resumeStatus.dataset.error = "false";
  renderResumeSetting(data.resume_url);
}

async function removeStoredResume(url) {
  const path = resumeStoragePath(url);
  if (!path) {
    return;
  }

  const { error } = await client.storage.from(resumeBucket).remove([path]);
  if (error) {
    throw new Error(`The resume link was updated, but the old PDF could not be removed from storage: ${error.message}`);
  }
}

function resetSocialLinkForm() {
  socialLinkForm.reset();
  document.getElementById("social-link-id").value = "";
  document.getElementById("social-link-order").value = String(socialLinks.length);
  selectedSocialLinkId = "";
  document.getElementById("social-link-editor-heading").textContent = "New link";
  socialLinkList.querySelectorAll(".admin-project-item").forEach((item) => item.classList.remove("active"));
  renderSocialPagePreview();
}

function renderSocialLinkList() {
  socialLinkList.replaceChildren();
  socialLinks.forEach((link) => {
    const row = document.createElement("div");
    row.className = "admin-project-item-row";

    const selectButton = document.createElement("button");
    selectButton.className = "admin-project-item";
    selectButton.type = "button";
    selectButton.dataset.socialLinkId = link.id;
    selectButton.textContent = link.label;
    selectButton.addEventListener("click", () => {
      selectedSocialLinkId = link.id;
      document.getElementById("social-link-id").value = link.id;
      document.getElementById("social-link-label").value = link.label;
      document.getElementById("social-link-icon").value = link.icon_key;
      document.getElementById("social-link-url").value = link.url;
      document.getElementById("social-link-order").value = String(link.display_order);
      document.getElementById("social-link-editor-heading").textContent = "Edit link";
      socialLinkList.querySelectorAll(".admin-project-item").forEach((item) => {
        item.classList.toggle("active", item.dataset.socialLinkId === link.id);
      });
      renderSocialPagePreview();
    });

    const removeButton = document.createElement("button");
    removeButton.className = "admin-project-delete";
    removeButton.type = "button";
    removeButton.textContent = "Delete";
    removeButton.setAttribute("aria-label", `Delete ${link.label} link`);
    removeButton.addEventListener("click", () => deleteSocialLink(link));

    row.append(selectButton, removeButton);
    socialLinkList.append(row);
  });

  if (!socialLinks.length) {
    const emptyState = document.createElement("p");
    emptyState.className = "admin-status";
    emptyState.textContent = "No profile links yet. Add one using the form.";
    socialLinkList.append(emptyState);
  }
  renderSocialPagePreview();
}

async function loadSocialLinks() {
  const { data, error } = await client
    .from("social_links")
    .select("id, label, url, icon_key, display_order")
    .order("display_order", { ascending: true });

  if (error) {
    throw new Error(`Could not load social links: ${error.message}`);
  }

  socialLinks = data || [];
  renderSocialLinkList();
  resetSocialLinkForm();
}

async function deleteSocialLink(link) {
  if (!window.confirm(`Delete the ${link.label} link? This cannot be undone.`)) {
    return;
  }

  try {
    const { error } = await client.from("social_links").delete().eq("id", link.id);
    if (error) {
      throw new Error(error.message);
    }

    await loadSocialLinks();
    setStatus(dashboardStatus, `${link.label} link deleted.`);
  } catch (error) {
    console.error(error);
    setStatus(dashboardStatus, `Could not delete social link: ${error.message}`, true);
  }
}

function resetCatalogForm(type) {
  const form = catalogForms[type];
  form.reset();
  form.elements.namedItem("id").value = "";
  form.elements.namedItem("display_order").value = String(catalogItems[type].length);
  if (type === "skill") {
    form.elements.namedItem("status").value = "Completed";
  }
  selectedCatalogIds[type] = "";
  document.getElementById(`${type}-editor-heading`).textContent = `New ${type}`;
  catalogLists[type].querySelectorAll(".admin-project-item").forEach((item) => item.classList.remove("active"));
  renderCatalogPagePreview(type);
}

function renderCatalogList(type) {
  const list = catalogLists[type];
  list.replaceChildren();
  catalogItems[type].forEach((entry) => {
    const row = document.createElement("div");
    row.className = "admin-project-item-row";

    const selectButton = document.createElement("button");
    selectButton.className = "admin-project-item";
    selectButton.type = "button";
    selectButton.dataset.itemId = entry.id;
    const itemName = document.createElement("span");
    itemName.className = "admin-catalog-item-name";
    itemName.textContent = entry.name;
    selectButton.append(itemName);
    if (type === "skill") {
      const itemStatus = document.createElement("span");
      itemStatus.className = "admin-catalog-item-status";
      itemStatus.textContent = entry.status;
      selectButton.append(itemStatus);
    }
    selectButton.addEventListener("click", () => {
      selectedCatalogIds[type] = entry.id;
      const form = catalogForms[type];
      form.elements.namedItem("id").value = entry.id;
      form.elements.namedItem("name").value = entry.name;
      form.elements.namedItem("icon_class").value = entry.icon_class;
      form.elements.namedItem("display_order").value = String(entry.display_order);
      if (type === "skill") {
        form.elements.namedItem("status").value = entry.status;
      } else {
        form.elements.namedItem("description").value = entry.description || "";
      }
      document.getElementById(`${type}-editor-heading`).textContent = `Edit ${type}`;
      list.querySelectorAll(".admin-project-item").forEach((item) => {
        item.classList.toggle("active", item.dataset.itemId === entry.id);
      });
      renderCatalogPagePreview(type);
    });

    const removeButton = document.createElement("button");
    removeButton.className = "admin-project-delete";
    removeButton.type = "button";
    removeButton.textContent = "Delete";
    removeButton.setAttribute("aria-label", `Delete ${entry.name}`);
    removeButton.addEventListener("click", () => deleteCatalogItem(type, entry));

    row.append(selectButton, removeButton);
    list.append(row);
  });

  if (!catalogItems[type].length) {
    const emptyState = document.createElement("p");
    emptyState.className = "admin-status";
    emptyState.textContent = `No ${type}s yet. Add one using the form.`;
    list.append(emptyState);
  }
  renderCatalogPagePreview(type);
}

async function loadCatalogItems(type) {
  const { data, error } = await client
    .from("portfolio_skills_tools")
    .select("id, entry_type, name, description, status, icon_class, display_order")
    .eq("entry_type", type)
    .order("display_order", { ascending: true });

  if (error) {
    throw new Error(`Could not load ${type}s: ${error.message}`);
  }

  catalogItems[type] = data || [];
  renderCatalogList(type);
  resetCatalogForm(type);
}

async function deleteCatalogItem(type, entry) {
  if (!window.confirm(`Delete ${entry.name} from ${type}s? This cannot be undone.`)) {
    return;
  }

  try {
    const { error } = await client
      .from("portfolio_skills_tools")
      .delete()
      .eq("id", entry.id)
      .eq("entry_type", type);
    if (error) {
      throw new Error(error.message);
    }

    await loadCatalogItems(type);
    setStatus(dashboardStatus, `${entry.name} deleted from ${type}s.`);
  } catch (error) {
    console.error(error);
    setStatus(dashboardStatus, `Could not delete ${type}: ${error.message}`, true);
  }
}

async function saveCatalogItem(type) {
  const formData = new FormData(catalogForms[type]);
  const name = String(formData.get("name")).trim();
  const iconClass = String(formData.get("icon_class")).trim();
  if (!/^(fab|fas|far) fa-[a-z0-9-]+$/.test(iconClass)) {
    setStatus(dashboardStatus, "Use a valid Font Awesome icon class, such as `fab fa-java` or `fas fa-database`.", true);
    return;
  }

  const row = {
    id: selectedCatalogIds[type] || crypto.randomUUID(),
    entry_type: type,
    name,
    description: type === "tool" ? String(formData.get("description")).trim() : "",
    status: type === "skill" ? String(formData.get("status")) : "",
    icon_class: iconClass,
    display_order: Number(formData.get("display_order")),
    updated_at: new Date().toISOString()
  };

  try {
    const { error } = await client.from("portfolio_skills_tools").upsert(row);
    if (error) {
      throw new Error(error.message);
    }

    await loadCatalogItems(type);
    setStatus(dashboardStatus, `${name} ${type} saved.`);
  } catch (error) {
    console.error(error);
    setStatus(dashboardStatus, `Could not save ${type}: ${error.message}`, true);
  }
}

async function verifyAdmin() {
  const { data, error } = await client.rpc("is_portfolio_admin");
  if (error) {
    throw new Error(`Could not verify admin access: ${error.message}`);
  }
  if (data !== true) {
    throw new Error("This account is not on the portfolio admin allowlist.");
  }
}

async function updateAdminChatPresence(isOnline) {
  const { error } = await client.rpc("touch_chat_presence", { p_is_online: isOnline });
  if (error) {
    throw new Error(error.message);
  }
}

async function openDashboard() {
  try {
    await verifyAdmin();
    showDashboard();
    await Promise.all([loadProjects(), loadSettings(), loadResumeSetting()]);
    let setupMessage = "";
    try {
      await updateAdminChatPresence(true);
    } catch (error) {
      console.error(error);
      setupMessage = `Online status unavailable: ${error.message}. Run the latest supabase/chat-migration.sql.`;
    }
    try {
      await loadSocialLinks();
    } catch (error) {
      console.error(error);
      setupMessage = [setupMessage, `${error.message} Run supabase/social-links-migration.sql in the Supabase SQL Editor to enable link management.`].filter(Boolean).join(" ");
    }
    try {
      await Promise.all([loadCatalogItems("skill"), loadCatalogItems("tool")]);
    } catch (error) {
      console.error(error);
      setupMessage = [setupMessage, `${error.message} Run supabase/skills-tools-migration.sql in the Supabase SQL Editor to enable Skills and Tools management.`].filter(Boolean).join(" ");
    }
    await loadChatInbox();
    window.clearInterval(chatInboxTimer);
    chatInboxTimer = window.setInterval(() => {
      loadChatInbox().catch((error) => {
        console.error(error);
        setStatus(document.getElementById("chat-inbox-status"), `Could not refresh chat inbox: ${error.message}`, true);
      });
    }, 10000);
    window.clearInterval(chatPresenceTimer);
    chatPresenceTimer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || dashboard.hidden) {
        return;
      }
      updateAdminChatPresence(true).catch((error) => {
        console.error("Could not refresh admin chat presence:", error);
        setStatus(dashboardStatus, `Online status unavailable: ${error.message}`, true);
      });
    }, 30000);
    if (setupMessage) {
      setStatus(dashboardStatus, setupMessage, true);
    } else {
      setStatus(dashboardStatus, "Signed in. Changes are saved to Supabase.");
    }
  } catch (error) {
    console.error(error);
    await client.auth.signOut();
    showLogin(error.message);
  }
}

async function initialize() {
  if (!config?.url || !config?.anonKey || !window.supabase?.createClient) {
    setStatus(
      authStatus,
      "Admin is not configured. Follow the Supabase setup guide and add the project URL and anon key to supabase-config.js.",
      true
    );
    return;
  }

  client = window.supabase.createClient(config.url, config.anonKey);
  const { data, error } = await client.auth.getSession();
  if (error) {
    setStatus(authStatus, `Could not restore the admin session: ${error.message}`, true);
    return;
  }
  if (data.session) {
    await openDashboard();
  } else {
    setStatus(authStatus, "Sign in with the account added to the Supabase admin allowlist.");
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!client) {
    return;
  }

  setStatus(authStatus, "Signing in…");
  const formData = new FormData(loginForm);
  const { data, error } = await client.auth.signInWithPassword({
    email: String(formData.get("email")).trim(),
    password: String(formData.get("password"))
  });

  if (error) {
    setStatus(authStatus, `Sign-in failed: ${error.message}`, true);
    return;
  }
  if (!data.session) {
    setStatus(authStatus, "Sign-in did not create an authenticated session.", true);
    return;
  }

  await openDashboard();
});

document.getElementById("admin-signout").addEventListener("click", async () => {
  window.clearInterval(chatInboxTimer);
  window.clearInterval(chatPresenceTimer);
  try {
    await updateAdminChatPresence(false);
  } catch (error) {
    console.error("Could not mark admin offline:", error);
  }
  const { error } = await client.auth.signOut();
  if (error) {
    updateAdminChatPresence(true).catch((presenceError) => {
      console.error("Could not restore admin presence after sign-out failed:", presenceError);
    });
    chatPresenceTimer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !dashboard.hidden) {
        updateAdminChatPresence(true).catch((presenceError) => {
          console.error("Could not refresh admin chat presence:", presenceError);
        });
      }
    }, 30000);
    setStatus(dashboardStatus, `Could not sign out: ${error.message}`, true);
    return;
  }
  showLogin("You have signed out.");
});

document.addEventListener("visibilitychange", () => {
  if (!client || dashboard.hidden || document.visibilityState !== "visible") {
    return;
  }
  updateAdminChatPresence(true).catch((error) => {
    console.error("Could not refresh admin chat presence:", error);
    setStatus(dashboardStatus, `Online status unavailable: ${error.message}`, true);
  });
});

document.getElementById("refresh-chat-inbox").addEventListener("click", async () => {
  await loadChatInbox();
});

document.getElementById("admin-chat-reply-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.getElementById("admin-chat-reply");
  const fileInput = document.getElementById("admin-chat-file");
  const body = input.value.trim();
  const file = fileInput.files?.[0] || null;
  if ((!body && !file) || !selectedChatConversationId || body.length > 2000) {
    return;
  }
  if (file && (file.size > chatAttachmentMaxSize || !chatAttachmentTypes.has(file.type))) {
    setStatus(document.getElementById("chat-inbox-status"), "Choose a supported photo or document up to 10 MB.", true);
    return;
  }
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    setStatus(document.getElementById("chat-inbox-status"), "Your admin session expired. Sign in again to reply.", true);
    return;
  }
  const conversationId = selectedChatConversationId;
  let attachmentPath = null;
  let attachmentName = null;
  if (file) {
    attachmentName = file.name.normalize("NFKC").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(-180) || "attachment";
    attachmentPath = `${conversationId}/${userData.user.id}/${crypto.randomUUID()}-${attachmentName}`;
    const { error: uploadError } = await client.storage
      .from(chatAttachmentBucket)
      .upload(attachmentPath, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setStatus(document.getElementById("chat-inbox-status"), `Could not upload attachment: ${uploadError.message}`, true);
      return;
    }
  }
  const { error } = await client.from("chat_messages").insert({
    conversation_id: conversationId,
    sender_id: userData.user.id,
    body,
    attachment_path: attachmentPath,
    attachment_name: attachmentName
  });
  if (error) {
    if (attachmentPath) {
      await client.storage.from(chatAttachmentBucket).remove([attachmentPath]);
    }
    setStatus(document.getElementById("chat-inbox-status"), `Could not send reply: ${error.message}`, true);
    return;
  }
  input.value = "";
  fileInput.value = "";
  document.getElementById("admin-chat-file-name").textContent = "";
  await loadChatInbox();
});

document.getElementById("chat-group-create-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const nameInput = document.getElementById("chat-group-name");
  const name = nameInput.value.trim();
  if (!name || name.length > 80) {
    return;
  }
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    setStatus(document.getElementById("chat-group-status"), "Your admin session expired. Sign in again to create a room.", true);
    return;
  }
  const { data, error } = await client
    .from("chat_groups")
    .insert({ name, created_by: userData.user.id })
    .select("id, name, created_by, created_at, updated_at")
    .single();
  if (error) {
    setStatus(document.getElementById("chat-group-status"), `Could not create room: ${error.message}`, true);
    return;
  }
  selectedChatGroupId = data.id;
  latestAdminGroupMessageId = "";
  nameInput.value = "";
  form.reset();
  await loadChatGroups();
  setStatus(document.getElementById("chat-group-status"), `Room created. Share invite ID ${data.id} only with invited members.`);
});

document.getElementById("copy-chat-group-id").addEventListener("click", async () => {
  if (!selectedChatGroupId) {
    return;
  }
  try {
    await navigator.clipboard.writeText(selectedChatGroupId);
    setStatus(document.getElementById("chat-group-status"), "Room invite ID copied.");
  } catch (error) {
    setStatus(document.getElementById("chat-group-status"), `Could not copy room ID: ${error.message}`, true);
  }
});

document.getElementById("admin-group-reply-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.getElementById("admin-group-reply");
  const fileInput = document.getElementById("admin-group-file");
  const body = input.value.trim();
  const file = fileInput.files?.[0] || null;
  if (!selectedChatGroupId || (!body && !file) || body.length > 2000) {
    return;
  }
  if (file && (file.size > chatAttachmentMaxSize || !chatAttachmentTypes.has(file.type))) {
    setStatus(document.getElementById("chat-group-status"), "Choose a supported photo or document up to 10 MB.", true);
    return;
  }
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    setStatus(document.getElementById("chat-group-status"), "Your admin session expired. Sign in again to send a message.", true);
    return;
  }

  let attachmentPath = null;
  let attachmentName = null;
  if (file) {
    attachmentName = file.name.normalize("NFKC").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(-180) || "attachment";
    attachmentPath = `${selectedChatGroupId}/${userData.user.id}/${crypto.randomUUID()}-${attachmentName}`;
    const { error: uploadError } = await client.storage
      .from(chatAttachmentBucket)
      .upload(attachmentPath, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setStatus(document.getElementById("chat-group-status"), `Could not upload attachment: ${uploadError.message}`, true);
      return;
    }
  }

  const groupId = selectedChatGroupId;
  const { error } = await client.from("chat_group_messages").insert({
    group_id: groupId,
    sender_id: userData.user.id,
    body,
    attachment_path: attachmentPath,
    attachment_name: attachmentName
  });
  if (error) {
    if (attachmentPath) {
      await client.storage.from(chatAttachmentBucket).remove([attachmentPath]);
    }
    setStatus(document.getElementById("chat-group-status"), `Could not send group message: ${error.message}`, true);
    return;
  }
  input.value = "";
  fileInput.value = "";
  document.getElementById("admin-group-file-name").textContent = "";
  await loadChatGroups();
});

document.getElementById("new-project").addEventListener("click", () => {
  resetProjectForm();
  setStatus(dashboardStatus, "Enter the project details, then save.");
});

document.getElementById("import-github-projects").addEventListener("click", async () => {
  const username = document.getElementById("github-username").value.trim() || config?.githubUsername || "";
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(username)) {
    setStatus(dashboardStatus, "Enter a valid GitHub username before importing repositories.", true);
    return;
  }

  setStatus(dashboardStatus, `Loading public repositories for ${username}…`);
  try {
    const response = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`,
      { headers: { Accept: "application/vnd.github+json" } }
    );
    if (!response.ok) {
      throw new Error(`GitHub returned ${response.status} while loading repositories.`);
    }

    const repositories = await response.json();
    if (!Array.isArray(repositories) || repositories.length === 0) {
      throw new Error("No public repositories were found for this GitHub account.");
    }
    if (repositories.length === 100) {
      throw new Error("The account has 100 or more public repositories; import was stopped to avoid an incomplete replacement.");
    }

    const usedSlugs = new Set();
    const rows = repositories.map((repository, index) => {
      const baseSlug = repository.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (!baseSlug) {
        throw new Error(`Could not create a project URL slug for repository "${repository.name}".`);
      }

      let slug = baseSlug;
      let suffix = 2;
      while (usedSlugs.has(slug)) {
        slug = `${baseSlug}-${suffix}`;
        suffix += 1;
      }
      usedSlugs.add(slug);

      const owner = repository.owner?.login;
      const repo = repository.name;
      if (!owner || !repo) {
        throw new Error("GitHub returned a repository without an owner or name; import was stopped.");
      }

      return {
        slug,
        title: repo,
        category: repository.language || "GitHub Repository",
        description: repository.description?.trim() || `Public repository by ${owner}.`,
        technologies: repository.language ? [repository.language] : [],
        challenge: "",
        approach: "",
        outcome: "",
        preview_image_url: "",
        preview_type: "screenshot",
        github_owner: owner,
        github_repo: repo,
        live_demo_url: "",
        display_order: index + 1
      };
    });

    if (!window.confirm(
      `Replace all ${projects.length} current projects with ${rows.length} public repositories from ${username}? This permanently removes the current project records.`
    )) {
      setStatus(dashboardStatus, "GitHub repository import cancelled.");
      return;
    }

    setStatus(dashboardStatus, `Replacing projects with ${rows.length} GitHub repositories…`);
    const { data: importedCount, error } = await client.rpc("replace_projects_from_github", {
      p_projects: rows
    });
    if (error) {
      throw new Error(`${error.message} Run supabase/github-project-import-migration.sql in the Supabase SQL Editor if the import function is missing.`);
    }
    if (importedCount !== rows.length) {
      throw new Error(`Supabase reported ${importedCount} imported projects; expected ${rows.length}. Reload the project list and check the database.`);
    }

    await loadProjects();
    resetProjectForm();
    setStatus(dashboardStatus, `Replaced the project list with ${importedCount} public GitHub repositories.`);
  } catch (error) {
    console.error(error);
    setStatus(dashboardStatus, `Could not import GitHub repositories: ${error.message}`, true);
  }
});

document.getElementById("github-settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = document.getElementById("github-username").value.trim();
  const validUsername = !username || /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(username);
  if (!validUsername) {
    setStatus(dashboardStatus, "Enter a valid GitHub username (letters, numbers, and single hyphens only).", true);
    return;
  }

  const { error } = await client
    .from("portfolio_settings")
    .update({ github_username: username, updated_at: new Date().toISOString() })
    .eq("id", 1);

  if (error) {
    console.error(error);
    setStatus(dashboardStatus, `Could not save GitHub profile: ${error.message}`, true);
    return;
  }
  setStatus(dashboardStatus, username ? "GitHub profile saved." : "GitHub profile cleared.");
});

resumeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = resumeFileInput.files[0];
  if (!file) {
    setStatus(dashboardStatus, "Choose a PDF resume to upload.", true);
    return;
  }
  if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf")) {
    setStatus(dashboardStatus, "Choose a valid PDF file.", true);
    return;
  }
  if (file.size === 0 || file.size > resumeMaxSize) {
    setStatus(dashboardStatus, "The resume PDF must be 10 MB or smaller.", true);
    return;
  }

  resumeUploadButton.disabled = true;
  resumeDeleteButton.disabled = true;
  setStatus(dashboardStatus, "Uploading resume…");
  const storagePath = `resume/${crypto.randomUUID()}.pdf`;
  try {
    const { error: uploadError } = await client.storage
      .from(resumeBucket)
      .upload(storagePath, file, { contentType: "application/pdf", upsert: false });
    if (uploadError) {
      throw new Error(`Could not upload resume: ${uploadError.message}`);
    }

    const uploadedUrl = client.storage.from(resumeBucket).getPublicUrl(storagePath).data.publicUrl;
    const { data, error: settingsError } = await client
      .from("portfolio_settings")
      .update({ resume_url: uploadedUrl, updated_at: new Date().toISOString() })
      .eq("id", 1)
      .select("resume_url")
      .single();
    if (settingsError) {
      const { error: cleanupError } = await client.storage.from(resumeBucket).remove([storagePath]);
      const cleanupMessage = cleanupError ? ` The uploaded file also could not be removed: ${cleanupError.message}` : "";
      throw new Error(`Could not save resume settings: ${settingsError.message}.${cleanupMessage}`);
    }

    const previousUrl = currentResumeUrl;
    renderResumeSetting(data.resume_url);
    resumeFileInput.value = "";
    try {
      await removeStoredResume(previousUrl);
      setStatus(dashboardStatus, "Resume uploaded and published.");
    } catch (error) {
      console.error(error);
      setStatus(dashboardStatus, `Resume uploaded and published. ${error.message}`, true);
    }
  } catch (error) {
    console.error(error);
    setStatus(dashboardStatus, error.message, true);
  } finally {
    resumeUploadButton.disabled = false;
    resumeDeleteButton.disabled = !currentResumeUrl;
  }
});

resumeDeleteButton.addEventListener("click", async () => {
  if (!currentResumeUrl || !window.confirm("Remove the published resume? Visitors will no longer see a resume link.")) {
    return;
  }

  resumeUploadButton.disabled = true;
  resumeDeleteButton.disabled = true;
  setStatus(dashboardStatus, "Removing resume…");
  const previousUrl = currentResumeUrl;
  try {
    const { error } = await client
      .from("portfolio_settings")
      .update({ resume_url: "", updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) {
      throw new Error(`Could not remove resume link: ${error.message}`);
    }

    renderResumeSetting("");
    try {
      await removeStoredResume(previousUrl);
      setStatus(dashboardStatus, "Resume removed.");
    } catch (error) {
      console.error(error);
      setStatus(dashboardStatus, `Resume link removed. ${error.message}`, true);
    }
  } catch (error) {
    console.error(error);
    setStatus(dashboardStatus, error.message, true);
    resumeDeleteButton.disabled = false;
  } finally {
    resumeUploadButton.disabled = false;
  }
});

document.getElementById("new-social-link").addEventListener("click", () => {
  resetSocialLinkForm();
  document.getElementById("social-link-label").focus();
});

document.getElementById("reset-social-link").addEventListener("click", resetSocialLinkForm);

document.getElementById("new-skill").addEventListener("click", () => {
  resetCatalogForm("skill");
  document.getElementById("skill-name").focus();
});

document.getElementById("new-tool").addEventListener("click", () => {
  resetCatalogForm("tool");
  document.getElementById("tool-name").focus();
});

document.getElementById("reset-skill").addEventListener("click", () => resetCatalogForm("skill"));
document.getElementById("reset-tool").addEventListener("click", () => resetCatalogForm("tool"));
skillForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveCatalogItem("skill");
});
toolForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveCatalogItem("tool");
});

socialLinkForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(socialLinkForm);
  const label = String(formData.get("label")).trim();
  const url = String(formData.get("url")).trim();
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    setStatus(dashboardStatus, "Enter a valid HTTPS link.", true);
    return;
  }
  if (parsedUrl.protocol !== "https:") {
    setStatus(dashboardStatus, "Profile links must use HTTPS.", true);
    return;
  }

  const id = selectedSocialLinkId || crypto.randomUUID();
  const { error } = await client.from("social_links").upsert({
    id,
    label,
    url: parsedUrl.href,
    icon_key: String(formData.get("icon_key")),
    display_order: Number(formData.get("display_order")),
    updated_at: new Date().toISOString()
  });
  if (error) {
    console.error(error);
    setStatus(dashboardStatus, `Could not save social link: ${error.message}`, true);
    return;
  }

  await loadSocialLinks();
  setStatus(dashboardStatus, `${label} link saved.`);
});

document.getElementById("import-starter-projects").addEventListener("click", async () => {
  try {
    const response = await fetch("../projects.json");
    if (!response.ok) {
      throw new Error(`Could not load starter projects (${response.status}).`);
    }
    const starters = await response.json();
    const rows = starters.map((project) => ({
      slug: project.slug,
      title: project.title,
      category: project.category,
      description: project.description,
      technologies: project.technologies,
      challenge: project.challenge,
      approach: project.approach,
      outcome: project.outcome,
      preview_image_url: project.previewImage,
      preview_type: project.previewType,
      github_owner: project.githubOwner,
      github_repo: project.githubRepo,
      live_demo_url: project.liveDemoUrl,
      display_order: project.displayOrder
    }));
    const { error } = await client.from("projects").insert(rows);
    if (error) {
      throw new Error(error.message);
    }
    await loadProjects();
    setStatus(dashboardStatus, "Starter case studies imported.");
  } catch (error) {
    console.error(error);
    setStatus(dashboardStatus, `Could not import starter projects: ${error.message}`, true);
  }
});

async function deleteProject(slug, title) {
  if (!slug || !window.confirm(`Delete “${title}”? This cannot be undone.`)) {
    return;
  }

  try {
    const { error } = await client.from("projects").delete().eq("slug", slug);
    if (error) {
      throw new Error(error.message);
    }

    if (selectedSlug === slug) {
      resetProjectForm();
    }
    await loadProjects();
    setStatus(dashboardStatus, "Project deleted.");
  } catch (error) {
    console.error(error);
    setStatus(dashboardStatus, `Could not delete project: ${error.message}`, true);
  }
}

projectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(projectForm);
  const slug = String(formData.get("slug")).trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    setStatus(dashboardStatus, "The project URL slug may contain lowercase letters, numbers, and single hyphens.", true);
    return;
  }

  const demoUrl = String(formData.get("live_demo_url")).trim();
  if (demoUrl && !isHttpsUrl(demoUrl)) {
    setStatus(dashboardStatus, "Live demo links must use HTTPS.", true);
    return;
  }

  const previewImageUrl = String(formData.get("preview_image_url")).trim();
  if (previewImageUrl && !previewImageUrl.startsWith("assets/") && !isHttpsUrl(previewImageUrl)) {
    setStatus(dashboardStatus, "Screenshot URLs must use HTTPS, or be a local path under assets/.", true);
    return;
  }

  const owner = String(formData.get("github_owner")).trim();
  const repository = String(formData.get("github_repo")).trim();
  if (Boolean(owner) !== Boolean(repository)) {
    setStatus(dashboardStatus, "Provide both a GitHub owner and repository, or leave both empty.", true);
    return;
  }
  if (
    (owner && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) ||
    (repository && !/^[A-Za-z0-9._-]+$/.test(repository))
  ) {
    setStatus(dashboardStatus, "Enter a valid GitHub owner and repository name.", true);
    return;
  }

  const row = {
    slug,
    title: String(formData.get("title")).trim(),
    category: String(formData.get("category")).trim(),
    description: String(formData.get("description")).trim(),
    technologies: String(formData.get("technologies"))
      .split(",")
      .map((technology) => technology.trim())
      .filter(Boolean),
    challenge: String(formData.get("challenge")).trim(),
    approach: String(formData.get("approach")).trim(),
    outcome: String(formData.get("outcome")).trim(),
    preview_image_url: previewImageUrl,
    preview_type: String(formData.get("preview_type")),
    github_owner: owner,
    github_repo: repository,
    live_demo_url: demoUrl,
    display_order: Number(formData.get("display_order")),
    updated_at: new Date().toISOString()
  };

  const image = imageInput.files[0];
  if (image) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(image.type) || image.size > 5 * 1024 * 1024) {
      setStatus(dashboardStatus, "Choose a PNG, JPEG, or WebP image smaller than 5 MB.", true);
      return;
    }

    const safeName = image.name.replace(/[^A-Za-z0-9._-]/g, "-");
    const storagePath = `projects/${slug}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await client.storage
      .from("project-images")
      .upload(storagePath, image, { contentType: image.type, upsert: false });
    if (uploadError) {
      console.error(uploadError);
      setStatus(dashboardStatus, `Could not upload screenshot: ${uploadError.message}`, true);
      return;
    }
    row.preview_image_url = client.storage.from("project-images").getPublicUrl(storagePath).data.publicUrl;
    row.preview_type = "screenshot";
  }

  const { error } = await client.from("projects").upsert(row, { onConflict: "slug" });
  if (error) {
    console.error(error);
    setStatus(
      dashboardStatus,
      image ? `Screenshot uploaded, but project save failed: ${error.message}` : `Could not save project: ${error.message}`,
      true
    );
    return;
  }

  await loadProjects();
  const savedProject = projects.find((project) => project.slug === slug);
  if (savedProject) {
    selectProject(savedProject);
  }
  setStatus(dashboardStatus, "Project saved and published.");
});

deleteButton.addEventListener("click", async () => {
  await deleteProject(selectedSlug, String(field("title").value));
});

document.getElementById("github-username").addEventListener("input", renderGithubPagePreview);
resumeFileInput.addEventListener("change", renderResumePagePreview);
socialLinkForm.addEventListener("input", renderSocialPagePreview);
socialLinkForm.addEventListener("change", renderSocialPagePreview);
skillForm.addEventListener("input", () => renderCatalogPagePreview("skill"));
skillForm.addEventListener("change", () => renderCatalogPagePreview("skill"));
toolForm.addEventListener("input", () => renderCatalogPagePreview("tool"));
toolForm.addEventListener("change", () => renderCatalogPagePreview("tool"));
projectForm.addEventListener("input", renderProjectsPagePreview);
projectForm.addEventListener("change", renderProjectsPagePreview);

initialize();
