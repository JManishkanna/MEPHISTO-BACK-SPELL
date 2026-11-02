(() => {
  const config = window.PORTFOLIO_SUPABASE_CONFIG;
  const authPanel = document.getElementById("chat-auth");
  const sessionPanel = document.getElementById("chat-session");
  const loginForm = document.getElementById("chat-login-form");
  const signupForm = document.getElementById("chat-signup-form");
  const authStatus = document.getElementById("chat-auth-status");
  const sessionStatus = document.getElementById("chat-session-status");
  const messageList = document.getElementById("chat-messages");
  const messageForm = document.getElementById("chat-message-form");
  const attachmentInput = document.getElementById("chat-attachment");
  const attachmentName = document.getElementById("chat-attachment-name");
  const clearAttachmentButton = document.getElementById("chat-clear-attachment");
  const messageActions = document.querySelector(".chat-message-actions");
  const groupList = document.getElementById("chat-group-list");
  const searchInput = document.getElementById("chat-search-input");
  const directButton = document.getElementById("chat-direct-button");
  const groupCount = document.getElementById("chat-group-count");
  const threadHeading = document.getElementById("chat-thread-heading");
  const threadAvatar = document.getElementById("chat-thread-avatar");
  const chatPresence = document.getElementById("chat-presence");
  const groupPresenceList = document.getElementById("chat-group-presence-list");
  const profileForm = document.getElementById("chat-profile-form");
  const profileNameInput = document.getElementById("chat-profile-display-name");
  const profileSettings = document.querySelector(".chat-profile-settings");
  const switchButton = document.getElementById("chat-auth-switch");
  const switchText = document.getElementById("chat-auth-switch-text");
  const resendConfirmationButton = document.getElementById("chat-resend-confirmation");
  let client = null;
  let currentUser = null;
  let conversationId = null;
  let joinedGroups = [];
  let activeGroup = null;
  let activeChatType = "direct";
  let latestMessageId = "";
  let latestProfileSignature = "";
  let pollTimer = null;
  let presenceTimer = null;
  let groupsTimer = null;
  let isLoadingMessages = false;
  let signupMode = false;
  const maxAttachmentSize = 10 * 1024 * 1024;
  const allowedAttachmentTypes = new Set([
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

  function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.dataset.error = String(isError);
  }

  function setThreadHeader(name, isGroup = false) {
    threadHeading.textContent = name;
    chatPresence.dataset.online = "false";
    chatPresence.lastChild.textContent = isGroup ? " Group conversation" : " Chat privately";
    groupPresenceList.hidden = true;
    groupPresenceList.replaceChildren();
    threadAvatar.classList.toggle("chat-group-avatar", isGroup);
    threadAvatar.classList.toggle("chat-direct-avatar", !isGroup);
    const icon = document.createElement("i");
    icon.className = `fas ${isGroup ? "fa-users" : "fa-user"}`;
    icon.setAttribute("aria-hidden", "true");
    threadAvatar.replaceChildren(icon);
  }

  function filterConversations() {
    const query = searchInput.value.trim().toLocaleLowerCase();
    directButton.hidden = !("manish private conversation".includes(query));
    groupList.querySelectorAll(".chat-room-button").forEach((button) => {
      button.hidden = !button.dataset.searchText.includes(query);
    });
  }

  function isEmailRateLimited(error) {
    return error?.code === "over_email_send_rate_limit"
      || /email rate limit|rate limit.*email|email.*rate limit/i.test(error?.message || "");
  }

  function emailRateLimitMessage() {
    return "Supabase has temporarily limited confirmation emails. Don’t retry sign-up; check your inbox and spam folder. If no email arrives, wait before requesting another or configure a custom SMTP provider in Supabase Auth.";
  }

  function confirmationRedirectUrl() {
    return window.location.href.split(/[?#]/, 1)[0];
  }

  function setAuthMode(isSignup) {
    signupMode = isSignup;
    loginForm.hidden = isSignup;
    signupForm.hidden = !isSignup;
    resendConfirmationButton.hidden = true;
    switchText.textContent = isSignup ? "Already have an account?" : "New here?";
    switchButton.textContent = isSignup ? "Sign in" : "Create an account";
    document.getElementById("chat-auth-heading").textContent = isSignup ? "Create your chat account" : "Welcome";
    setStatus(authStatus, "");
  }

  function showSession(user, displayName) {
    currentUser = user;
    authPanel.hidden = true;
    sessionPanel.hidden = false;
    document.body.classList.add("chat-active");
    sessionPanel.classList.remove("chat-showing-list");
    document.getElementById("chat-user-display-name").textContent = displayName;
    document.getElementById("chat-user-email").textContent = user.email || "";
    profileNameInput.value = displayName;
  }

  function showAuth(message = "", isError = false) {
    currentUser = null;
    conversationId = null;
    activeGroup = null;
    latestMessageId = "";
    window.clearInterval(pollTimer);
    window.clearInterval(presenceTimer);
    window.clearInterval(groupsTimer);
    sessionPanel.hidden = true;
    sessionPanel.classList.remove("chat-showing-list");
    document.body.classList.remove("chat-active");
    authPanel.hidden = false;
    messageList.replaceChildren();
    if (message) {
      setStatus(authStatus, message, isError);
    }
  }

  async function getConversation(user) {
    const { data: existing, error: lookupError } = await client
      .from("chat_conversations")
      .select("id")
      .eq("visitor_id", user.id)
      .maybeSingle();
    if (lookupError) {
      throw lookupError;
    }
    if (existing) {
      return existing.id;
    }

    const { data: created, error: insertError } = await client
      .from("chat_conversations")
      .insert({ visitor_id: user.id, visitor_email: user.email })
      .select("id")
      .single();
    if (!insertError) {
      return created.id;
    }
    if (insertError.code === "23505") {
      const { data: racedConversation, error: racedLookupError } = await client
        .from("chat_conversations")
        .select("id")
        .eq("visitor_id", user.id)
        .single();
      if (!racedLookupError) {
        return racedConversation.id;
      }
    }
    throw insertError;
  }

  async function getOrCreateDisplayName(user) {
    const { data: existing, error: lookupError } = await client
      .from("chat_profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (lookupError) {
      throw lookupError;
    }
    if (existing?.display_name) {
      return existing.display_name;
    }

    const fallbackName = (user.user_metadata?.display_name
      || user.email?.split("@")[0]
      || "Visitor").slice(0, 40).trim() || "Visitor";
    const { error: insertError } = await client
      .from("chat_profiles")
      .insert({ user_id: user.id, display_name: fallbackName });
    if (!insertError) {
      return fallbackName;
    }
    if (insertError.code === "23505") {
      const { data: racedProfile, error: racedLookupError } = await client
        .from("chat_profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .single();
      if (!racedLookupError) {
        return racedProfile.display_name;
      }
    }
    throw insertError;
  }

  function renderGroupList() {
    groupList.replaceChildren();
    groupCount.textContent = String(joinedGroups.length);
    if (!joinedGroups.length) {
      const empty = document.createElement("p");
      empty.className = "chat-help";
      empty.textContent = "No group chats joined yet.";
      groupList.append(empty);
      filterConversations();
      return;
    }

    joinedGroups.forEach((group) => {
      const button = document.createElement("button");
      button.className = `chat-room-button${activeChatType === "group" && activeGroup?.id === group.id ? " active" : ""}`;
      button.type = "button";
      button.dataset.searchText = `${group.name} group conversation`.toLocaleLowerCase();
      const avatar = document.createElement("span");
      avatar.className = "chat-room-avatar chat-group-avatar";
      avatar.setAttribute("aria-hidden", "true");
      const icon = document.createElement("i");
      icon.className = "fas fa-users";
      avatar.append(icon);
      const copy = document.createElement("span");
      copy.className = "chat-room-copy";
      const name = document.createElement("strong");
      name.textContent = group.name;
      const description = document.createElement("small");
      description.textContent = "Group conversation";
      copy.append(name, description);
      const chevron = document.createElement("i");
      chevron.className = "fas fa-chevron-right chat-room-chevron";
      chevron.setAttribute("aria-hidden", "true");
      button.append(avatar, copy, chevron);
      button.addEventListener("click", () => selectGroup(group));
      groupList.append(button);
    });
    filterConversations();
  }

  async function loadJoinedGroups() {
    if (!currentUser) {
      return;
    }
    const { data, error } = await client
      .from("chat_group_members")
      .select("group_id, chat_groups(id, name)")
      .eq("member_id", currentUser.id)
      .order("joined_at", { ascending: false });
    if (error) {
      console.error(error);
      setStatus(sessionStatus, `Could not load group chats: ${error.message}`, true);
      return;
    }
    joinedGroups = (data || []).map((membership) => membership.chat_groups).filter(Boolean);
    if (activeGroup && !joinedGroups.some((group) => group.id === activeGroup.id)) {
      activeGroup = null;
      activeChatType = "direct";
      latestMessageId = "";
      setThreadHeader("Manish");
      directButton.classList.add("active");
      await loadMessages();
      await refreshThreadPresence();
    }
    renderGroupList();
  }

  async function selectGroup(group) {
    activeChatType = "group";
    activeGroup = group;
    sessionPanel.classList.remove("chat-showing-list");
    latestMessageId = "";
    setThreadHeader(group.name, true);
    directButton.classList.remove("active");
    renderGroupList();
    await Promise.all([loadMessages(), refreshThreadPresence()]);
  }

  function selectDirectChat() {
    activeChatType = "direct";
    activeGroup = null;
    sessionPanel.classList.remove("chat-showing-list");
    latestMessageId = "";
    setThreadHeader("Manish");
    directButton.classList.add("active");
    renderGroupList();
    loadMessages();
    refreshThreadPresence();
  }

  async function refreshThreadPresence() {
    if (!currentUser) {
      return;
    }

    const requestedChatType = activeChatType;
    const requestedGroupId = activeGroup?.id;
    try {
      if (requestedChatType === "direct") {
        const { data, error } = await client.rpc("is_chat_admin_online");
        if (error) {
          throw error;
        }
        if (activeChatType !== "direct") {
          return;
        }
        chatPresence.dataset.online = String(Boolean(data));
        chatPresence.lastChild.textContent = data ? " Online now" : " Offline";
        return;
      }

      if (!requestedGroupId) {
        return;
      }
      const { data, error } = await client.rpc("get_chat_group_presence", {
        p_group_id: requestedGroupId
      });
      if (error) {
        throw error;
      }
      if (activeChatType === "group" && activeGroup?.id === requestedGroupId) {
        const members = data || [];
        const onlineCount = members.filter((member) => member.is_online).length;
        chatPresence.dataset.online = String(onlineCount > 0);
        chatPresence.lastChild.textContent = ` ${onlineCount} online`;
        groupPresenceList.replaceChildren();
        members.forEach((member) => {
          const item = document.createElement("span");
          item.className = `chat-group-presence-member${member.is_online ? " is-online" : ""}`;
          item.setAttribute("aria-label", `${member.display_name}: ${member.is_online ? "online" : "offline"}`);
          const dot = document.createElement("span");
          dot.className = "chat-group-presence-dot";
          dot.setAttribute("aria-hidden", "true");
          const name = document.createElement("span");
          name.textContent = member.display_name;
          item.append(dot, name);
          groupPresenceList.append(item);
        });
        groupPresenceList.hidden = members.length === 0;
      }
    } catch (error) {
      console.error("Could not refresh chat presence:", error);
      setStatus(sessionStatus, `Online status is unavailable: ${error.message}`, true);
    }
  }

  async function touchOwnPresence(isOnline) {
    const { error } = await client.rpc("touch_chat_presence", { p_is_online: isOnline });
    if (error) {
      throw error;
    }
  }

  async function renderMessages(messages, chatType, chatId, profileNames) {
    const isCurrentChat = () => chatType === activeChatType
      && chatId === (activeChatType === "group" ? activeGroup?.id : conversationId);
    if (!messages.length) {
      if (!isCurrentChat()) {
        return;
      }
      const empty = document.createElement("p");
      empty.className = "chat-empty";
      empty.textContent = "Send a message to start the conversation.";
      messageList.replaceChildren(empty);
      latestMessageId = "";
      latestProfileSignature = "";
      return;
    }

    const newestId = messages[messages.length - 1].id;
    const profileSignature = [...new Set(messages.map((message) => message.sender_id))]
      .sort()
      .map((userId) => `${userId}:${profileNames.get(userId) || ""}`)
      .join("|");
    if (newestId === latestMessageId
      && profileSignature === latestProfileSignature
      && messageList.childElementCount) {
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const message of messages) {
      const item = document.createElement("article");
      const isOwnMessage = !message.is_bot && message.sender_id === currentUser.id;
      item.className = `chat-message${isOwnMessage ? " is-own" : ""}`;
      const author = document.createElement("strong");
      author.textContent = message.is_bot
        ? "Mephisto Assistant"
        : message.sender_id === currentUser.id
        ? "You"
        : (chatType === "direct" ? "Manish" : (profileNames.get(message.sender_id) || "Group member"));
      if (message.body) {
        const body = document.createElement("p");
        body.textContent = message.body;
        item.append(author, body);
      } else {
        item.append(author);
      }
      if (message.attachment_path) {
        const { data, error } = await client.storage
          .from("chat-attachments")
          .createSignedUrl(message.attachment_path, 3600);
        if (!error && data?.signedUrl) {
          if (message.attachment_path.match(/\.(jpe?g|png|gif|webp)$/i)) {
            const image = document.createElement("img");
            image.className = "chat-attachment-preview";
            image.src = data.signedUrl;
            image.alt = message.attachment_name || "Shared image";
            image.loading = "lazy";
            item.append(image);
          }
          const attachment = document.createElement("a");
          attachment.className = "chat-attachment-link";
          attachment.href = data.signedUrl;
          attachment.target = "_blank";
          attachment.rel = "noopener noreferrer";
          attachment.download = message.attachment_name || "";
          const icon = document.createElement("i");
          icon.className = "fas fa-paperclip";
          icon.setAttribute("aria-hidden", "true");
          attachment.append(icon, document.createTextNode(message.attachment_name || "Download attachment"));
          item.append(attachment);
        }
      }
      const time = document.createElement("time");
      time.dateTime = message.created_at;
      time.textContent = new Date(message.created_at).toLocaleString();
      item.append(time);
      fragment.append(item);
    }
    if (!isCurrentChat()) {
      return;
    }
    latestMessageId = newestId;
    latestProfileSignature = profileSignature;
    messageList.replaceChildren(fragment);
    messageList.scrollTop = messageList.scrollHeight;
  }

  async function loadMessages() {
    if (!currentUser || (!conversationId && activeChatType === "direct") || (!activeGroup && activeChatType === "group") || isLoadingMessages) {
      return;
    }
    const requestChatType = activeChatType;
    const requestChatId = activeChatType === "group" ? activeGroup.id : conversationId;
    isLoadingMessages = true;
    try {
      const table = requestChatType === "group" ? "chat_group_messages" : "chat_messages";
      const idColumn = requestChatType === "group" ? "group_id" : "conversation_id";
      const messageColumns = requestChatType === "direct"
        ? "id, sender_id, body, attachment_path, attachment_name, created_at, is_bot"
        : "id, sender_id, body, attachment_path, attachment_name, created_at";
      const { data, error } = await client
        .from(table)
        .select(messageColumns)
        .eq(idColumn, requestChatId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) {
        throw error;
      }
      if (requestChatType !== activeChatType
        || requestChatId !== (activeChatType === "group" ? activeGroup?.id : conversationId)) {
        return;
      }
      const messages = (data || []).reverse();
      const profileNames = new Map();
      if (requestChatType === "group" && messages.length) {
        const senderIds = [...new Set(messages.map((message) => message.sender_id))];
        const { data: profiles, error: profileError } = await client
          .from("chat_profiles")
          .select("user_id, display_name")
          .in("user_id", senderIds);
        if (profileError) {
          throw profileError;
        }
        (profiles || []).forEach((profile) => profileNames.set(profile.user_id, profile.display_name));
      }
      await renderMessages(messages, requestChatType, requestChatId, profileNames);
    } catch (error) {
      console.error(error);
      setStatus(sessionStatus, `Could not load messages: ${error.message}`, true);
    } finally {
      isLoadingMessages = false;
    }
  }

  async function startChat(user) {
    const { data: adminResult, error: adminCheckError } = await client.rpc("is_portfolio_admin");
    if (adminCheckError) {
      throw adminCheckError;
    }
    if (adminResult) {
      showAuth("This is an admin account. Sign in at /admin/ to manage chats.", true);
      return;
    }

    const displayName = await getOrCreateDisplayName(user);
    showSession(user, displayName);
    let presenceErrorMessage = "";
    try {
      await touchOwnPresence(true);
    } catch (error) {
      console.error("Could not mark chat user online:", error);
      presenceErrorMessage = ` Online status is unavailable: ${error.message}`;
    }
    setStatus(sessionStatus, "Opening your private conversation…");
    conversationId = await getConversation(user);
    activeChatType = "direct";
    activeGroup = null;
    directButton.classList.add("active");
    setThreadHeader("Manish");
    setStatus(sessionStatus, "Loading your conversations…");
    await loadJoinedGroups();
    await loadMessages();
    window.clearInterval(pollTimer);
    pollTimer = window.setInterval(loadMessages, 5000);
    window.clearInterval(presenceTimer);
    presenceTimer = window.setInterval(async () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      try {
        await touchOwnPresence(true);
      } catch (error) {
        console.error("Could not refresh chat presence:", error);
        setStatus(sessionStatus, `Online status is unavailable: ${error.message}`, true);
      }
      await refreshThreadPresence();
    }, 30000);
    window.clearInterval(groupsTimer);
    groupsTimer = window.setInterval(loadJoinedGroups, 15000);
    setStatus(sessionStatus, `Messages refresh automatically. An automated assistant can answer common questions.${presenceErrorMessage}`, Boolean(presenceErrorMessage));
    await refreshThreadPresence();
  }

  async function initialize() {
    if (!config?.url || !config?.anonKey || !window.supabase?.createClient) {
      showAuth("Chat is not configured. Add the Supabase project URL and public anon key to supabase-config.js.", true);
      return;
    }
    client = window.supabase.createClient(config.url, config.anonKey);
    const { data, error } = await client.auth.getSession();
    if (error) {
      showAuth(`Could not restore your chat session: ${error.message}`, true);
      return;
    }
    if (data.session?.user) {
      try {
        await startChat(data.session.user);
      } catch (sessionError) {
        console.error(sessionError);
        showAuth(`Could not open chat: ${sessionError.message} Check the Supabase chat migration and email confirmation settings.`, true);
      }
    }
  }

  switchButton.addEventListener("click", () => setAuthMode(!signupMode));

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) {
      return;
    }
    const formData = new FormData(loginForm);
    setStatus(authStatus, "Signing in…");
    const { data, error } = await client.auth.signInWithPassword({
      email: String(formData.get("email")).trim(),
      password: String(formData.get("password"))
    });
    if (error) {
      if (error.code === "email_not_confirmed" || /email not confirmed/i.test(error.message)) {
        resendConfirmationButton.hidden = false;
        setStatus(authStatus, "Confirm your email address before signing in. You can resend the confirmation email below.", true);
        return;
      }
      setStatus(authStatus, `Sign-in failed: ${error.message}`, true);
      return;
    }
    try {
      await startChat(data.user);
    } catch (sessionError) {
      console.error(sessionError);
      showAuth(`Could not open chat: ${sessionError.message} Check the Supabase chat migration and email confirmation settings.`, true);
    }
  });

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) {
      return;
    }
    const formData = new FormData(signupForm);
    const email = String(formData.get("email")).trim();
    const password = String(formData.get("password"));
    if (password.length < 8) {
      setStatus(authStatus, "Choose a password with at least 8 characters.", true);
      return;
    }
    setStatus(authStatus, "Creating your account…");
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: confirmationRedirectUrl() }
    });
    if (error) {
      if (isEmailRateLimited(error)) {
        setAuthMode(false);
        document.getElementById("chat-login-email").value = email;
        setStatus(authStatus, emailRateLimitMessage(), true);
        return;
      }
      setStatus(authStatus, `Could not create account: ${error.message}`, true);
      return;
    }
    if (!data.session || !data.user) {
      setAuthMode(false);
      document.getElementById("chat-login-email").value = email;
      setStatus(authStatus, `Account created. Check ${email} for a confirmation link. After confirming, return here and sign in.`);
      return;
    }
    try {
      await startChat(data.user);
    } catch (sessionError) {
      console.error(sessionError);
      showAuth(`Could not open chat: ${sessionError.message} Check the Supabase chat migration and email confirmation settings.`, true);
    }
  });

  resendConfirmationButton.addEventListener("click", async () => {
    if (!client) {
      return;
    }
    const email = document.getElementById("chat-login-email").value.trim();
    if (!email) {
      setStatus(authStatus, "Enter your email address above first.", true);
      return;
    }
    resendConfirmationButton.disabled = true;
    setStatus(authStatus, "Sending a new confirmation email…");
    const { error } = await client.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: confirmationRedirectUrl() }
    });
    resendConfirmationButton.disabled = false;
    if (error) {
      setStatus(
        authStatus,
        isEmailRateLimited(error) ? emailRateLimitMessage() : `Could not resend confirmation email: ${error.message}`,
        true
      );
      return;
    }
    setStatus(authStatus, `If ${email} has an unconfirmed account, a new confirmation link is on its way.`);
  });

  document.getElementById("chat-signout").addEventListener("click", async () => {
    window.clearInterval(pollTimer);
    window.clearInterval(presenceTimer);
    window.clearInterval(groupsTimer);
    try {
      await touchOwnPresence(false);
    } catch (error) {
      console.error("Could not mark chat user offline:", error);
    }
    const { error } = await client.auth.signOut();
    if (error) {
      try {
        await touchOwnPresence(true);
      } catch (presenceError) {
        console.error("Could not restore chat presence after sign-out failed:", presenceError);
      }
      presenceTimer = window.setInterval(() => {
        if (document.visibilityState === "visible") {
          touchOwnPresence(true).catch((presenceError) => {
            console.error("Could not refresh chat presence:", presenceError);
          });
        }
      }, 30000);
      setStatus(sessionStatus, `Could not sign out: ${error.message}`, true);
      return;
    }
    showAuth("You have signed out.");
  });

  document.addEventListener("visibilitychange", () => {
    if (currentUser && document.visibilityState === "visible") {
      touchOwnPresence(true).catch((error) => {
        console.error("Could not refresh chat presence:", error);
        setStatus(sessionStatus, `Online status is unavailable: ${error.message}`, true);
      });
      refreshThreadPresence();
    }
  });

  document.getElementById("chat-direct-button").addEventListener("click", selectDirectChat);
  document.getElementById("chat-back-to-list").addEventListener("click", () => {
    sessionPanel.classList.add("chat-showing-list");
  });
  searchInput.addEventListener("input", filterConversations);

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentUser) {
      return;
    }
    const displayName = profileNameInput.value.trim().replace(/\s+/g, " ");
    if (displayName.length < 1 || displayName.length > 40) {
      setStatus(sessionStatus, "Display names must be between 1 and 40 characters.", true);
      return;
    }

    const button = profileForm.querySelector("button[type='submit']");
    button.disabled = true;
    try {
      const { error } = await client
        .from("chat_profiles")
        .upsert({ user_id: currentUser.id, display_name: displayName }, { onConflict: "user_id" });
      if (error) {
        throw error;
      }

      document.getElementById("chat-user-display-name").textContent = displayName;
      profileSettings.open = false;
      setStatus(sessionStatus, "Display name updated.");
      await loadMessages();
    } catch (error) {
      console.error(error);
      setStatus(sessionStatus, `Could not update your display name: ${error.message}`, true);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("chat-message").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      messageForm.requestSubmit();
    }
  });

  document.getElementById("chat-join-group-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("chat-group-id");
    const groupId = input.value.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(groupId)) {
      setStatus(sessionStatus, "Enter a valid group chat ID.", true);
      return;
    }

    const button = event.currentTarget.querySelector("button[type='submit']");
    button.disabled = true;
    setStatus(sessionStatus, "Joining group chat…");
    const { error } = await client.rpc("join_chat_group", { p_group_id: groupId });
    button.disabled = false;
    if (error) {
      setStatus(sessionStatus, `Could not join this group: ${error.message}`, true);
      return;
    }

    input.value = "";
    await loadJoinedGroups();
    const group = joinedGroups.find((item) => item.id.toLowerCase() === groupId.toLowerCase());
    if (!group) {
      setStatus(sessionStatus, "You joined the group, but it could not be loaded. Try refreshing the page.", true);
      return;
    }
    await selectGroup(group);
    setStatus(sessionStatus, "Joined group chat.");
  });

  function resetAttachmentSelection() {
    attachmentInput.value = "";
    attachmentName.textContent = "";
    clearAttachmentButton.hidden = true;
    messageActions.classList.remove("has-attachment");
  }

  clearAttachmentButton.addEventListener("click", resetAttachmentSelection);

  attachmentInput.addEventListener("change", () => {
    const file = attachmentInput.files[0];
    attachmentName.textContent = file ? file.name : "";
    clearAttachmentButton.hidden = !file;
    messageActions.classList.toggle("has-attachment", Boolean(file));
    if (file && (!allowedAttachmentTypes.has(file.type) || file.size > maxAttachmentSize)) {
      setStatus(
        sessionStatus,
        file.size > maxAttachmentSize
          ? "Files must be 10 MB or smaller."
          : "Choose a JPG, PNG, GIF, or WebP image, or a supported document file.",
        true
      );
      resetAttachmentSelection();
    } else {
      setStatus(sessionStatus, "");
    }
  });

  messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("chat-message");
    const body = input.value.trim();
    const file = attachmentInput.files[0];
    if ((!body && !file) || !currentUser || body.length > 2000) {
      if (body.length > 2000) {
        setStatus(sessionStatus, "Messages must be 2,000 characters or fewer.", true);
      }
      return;
    }

    const chatType = activeChatType;
    const chatId = chatType === "group" ? activeGroup?.id : conversationId;
    if (!chatId) {
      setStatus(sessionStatus, "Select a conversation before sending.", true);
      return;
    }

    const button = messageForm.querySelector("button[type='submit']");
    button.disabled = true;
    let uploadedPath = "";
    try {
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError) {
        throw new Error(`Could not verify your chat session: ${authError.message}`);
      }
      if (authData.user?.id !== currentUser.id) {
        throw new Error("Your chat session has changed or expired. Sign out and sign in again.");
      }

      setStatus(sessionStatus, file ? "Uploading attachment…" : "Sending…");
      if (file) {
        if (!allowedAttachmentTypes.has(file.type) || file.size > maxAttachmentSize) {
          throw new Error("Choose a supported photo or document up to 10 MB.");
        }
        const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-120) || "attachment";
        uploadedPath = `${chatId}/${currentUser.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await client.storage
          .from("chat-attachments")
          .upload(uploadedPath, file, { contentType: file.type, upsert: false });
        if (uploadError) {
          throw new Error(`Could not upload attachment: ${uploadError.message}`);
        }
      }

      const table = chatType === "group" ? "chat_group_messages" : "chat_messages";
      const payload = {
        [chatType === "group" ? "group_id" : "conversation_id"]: chatId,
        sender_id: currentUser.id,
        body,
        attachment_path: uploadedPath || null,
        attachment_name: file?.name || null
      };
      const { error } = await client.from(table).insert(payload);
      if (error) {
        if (error.code === "42501") {
          throw new Error(
            chatType === "direct"
              ? "Supabase rejected this message under chat_messages row-level security. Sign out and back in; if it continues, rerun supabase/chat-migration.sql after supabase/schema.sql in the Supabase SQL Editor."
              : "Supabase rejected this message under group chat row-level security. Confirm you are still a member of this group and rerun supabase/chat-migration.sql if needed."
          );
        }
        throw new Error(`Message could not be sent: ${error.message}`);
      }

      input.value = "";
      resetAttachmentSelection();
      setStatus(sessionStatus, "Message sent.");
      await loadMessages();
    } catch (error) {
      console.error(error);
      if (uploadedPath) {
        const { error: cleanupError } = await client.storage.from("chat-attachments").remove([uploadedPath]);
        if (cleanupError) {
          console.error("Could not remove the unattached chat upload:", cleanupError);
        }
      }
      setStatus(sessionStatus, error.message, true);
    } finally {
      button.disabled = false;
    }
  });

  setAuthMode(false);
  initialize();
})();
