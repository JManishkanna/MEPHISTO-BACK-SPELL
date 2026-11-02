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
  const switchButton = document.getElementById("chat-auth-switch");
  const switchText = document.getElementById("chat-auth-switch-text");
  const resendConfirmationButton = document.getElementById("chat-resend-confirmation");
  let client = null;
  let currentUser = null;
  let conversationId = null;
  let latestMessageId = "";
  let pollTimer = null;
  let isLoadingMessages = false;
  let signupMode = false;

  function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.dataset.error = String(isError);
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

  function showSession(user) {
    currentUser = user;
    authPanel.hidden = true;
    sessionPanel.hidden = false;
    document.getElementById("chat-user-email").textContent = user.email || "";
  }

  function showAuth(message = "", isError = false) {
    currentUser = null;
    conversationId = null;
    latestMessageId = "";
    sessionPanel.hidden = true;
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

  function renderMessages(messages) {
    if (!messages.length) {
      const empty = document.createElement("p");
      empty.className = "chat-empty";
      empty.textContent = "Send a message to start the conversation.";
      messageList.replaceChildren(empty);
      latestMessageId = "";
      return;
    }

    const newestId = messages[messages.length - 1].id;
    if (newestId === latestMessageId && messageList.childElementCount) {
      return;
    }
    latestMessageId = newestId;

    const fragment = document.createDocumentFragment();
    messages.forEach((message) => {
      const item = document.createElement("article");
      item.className = `chat-message${message.sender_id === currentUser.id ? " is-own" : ""}`;
      const author = document.createElement("strong");
      author.textContent = message.sender_id === currentUser.id ? "You" : "Manish";
      const body = document.createElement("p");
      body.textContent = message.body;
      const time = document.createElement("time");
      time.dateTime = message.created_at;
      time.textContent = new Date(message.created_at).toLocaleString();
      item.append(author, body, time);
      fragment.append(item);
    });
    messageList.replaceChildren(fragment);
    messageList.scrollTop = messageList.scrollHeight;
  }

  async function loadMessages() {
    if (!conversationId || isLoadingMessages) {
      return;
    }
    isLoadingMessages = true;
    try {
      const { data, error } = await client
        .from("chat_messages")
        .select("id, sender_id, body, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) {
        throw error;
      }
      renderMessages((data || []).reverse());
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

    showSession(user);
    setStatus(sessionStatus, "Opening your private conversation…");
    conversationId = await getConversation(user);
    setStatus(sessionStatus, "Messages refresh automatically.");
    await loadMessages();
    window.clearInterval(pollTimer);
    pollTimer = window.setInterval(loadMessages, 5000);
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

  messageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("chat-message");
    const body = input.value.trim();
    if (!body || !conversationId || !currentUser || body.length > 2000) {
      return;
    }
    const sendButton = messageForm.querySelector("button[type='submit']");
    sendButton.disabled = true;
    setStatus(sessionStatus, "Sending…");
    const { error } = await client.from("chat_messages").insert({
      conversation_id: conversationId,
      sender_id: currentUser.id,
      body
    });
    sendButton.disabled = false;
    if (error) {
      setStatus(sessionStatus, `Message could not be sent: ${error.message}`, true);
      return;
    }
    input.value = "";
    setStatus(sessionStatus, "Message sent.");
    await loadMessages();
  });

  document.getElementById("chat-signout").addEventListener("click", async () => {
    window.clearInterval(pollTimer);
    const { error } = await client.auth.signOut();
    if (error) {
      setStatus(sessionStatus, `Could not sign out: ${error.message}`, true);
      return;
    }
    showAuth("You have signed out.");
  });

  setAuthMode(false);
  initialize();
})();
