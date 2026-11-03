(() => {
  const config = window.PORTFOLIO_SUPABASE_CONFIG;
  const supabaseSdk = window.supabase;
  const supabaseClient =
    config?.url && config?.anonKey && supabaseSdk?.createClient
      ? supabaseSdk.createClient(config.url, config.anonKey)
      : null;
  const githubCacheTtl = 60 * 60 * 1000;
  const githubStaleCacheTtl = 24 * 60 * 60 * 1000;
  const githubInFlightRequests = new Map();

  function showServiceStatus(message, isError = false) {
    document.querySelectorAll(".project-data-status, .github-status").forEach((element) => {
      element.textContent = message;
      element.dataset.error = String(isError);
    });
  }

  function safeExternalUrl(value) {
    const url = String(value || "").trim();
    if (!url) {
      return "";
    }

    if (/^[a-z][a-z\d+.-]*:/i.test(url)) {
      try {
        return ["https:", "http:"].includes(new URL(url).protocol) ? url : "";
      } catch {
        return "";
      }
    }
    return url.startsWith("//") ? "" : url;
  }

  function validGitHubUsername(username) {
    return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(username);
  }

  function configureGitHubLinks(username) {
    if (!username || !validGitHubUsername(username)) {
      return;
    }
    document.querySelectorAll("[data-github-profile-link]").forEach((link) => {
      link.href = `https://github.com/${encodeURIComponent(username)}`;
      link.hidden = false;
    });
  }

  function configureResumeLinks(resumeUrl) {
    const url = String(resumeUrl || "").trim();
    const isSitePath = url.startsWith("/") && !url.startsWith("//");
    const isHttpsUrl = /^https:\/\//i.test(url);
    const validUrl = isSitePath || isHttpsUrl;

    document.querySelectorAll("[data-resume-link]").forEach((link) => {
      link.hidden = !validUrl;
      if (validUrl) {
        link.href = url;
      } else {
        link.removeAttribute("href");
      }
    });
    document.querySelectorAll("[data-resume-card]").forEach((card) => {
      card.hidden = !validUrl;
    });
  }

  function renderSocialLinks(links) {
    const icons = {
      github: "fab fa-github",
      linkedin: "fab fa-linkedin-in",
      instagram: "fab fa-instagram",
      leetcode: "fas fa-code",
      website: "fas fa-globe",
      youtube: "fab fa-youtube",
      x: "fab fa-x-twitter"
    };

    document.querySelectorAll("[data-social-links]").forEach((container) => {
      const isContactRow = container.classList.contains("social-row");
      const fragment = document.createDocumentFragment();
      links.forEach((link) => {
        const iconClass = icons[link.icon_key];
        if (!iconClass) {
          return;
        }

        const anchor = document.createElement("a");
        anchor.className = isContactRow ? "social-btn" : link.icon_key;
        anchor.href = link.url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.setAttribute("aria-label", link.label);
        const icon = document.createElement("i");
        icon.className = iconClass;
        icon.setAttribute("aria-hidden", "true");
        anchor.append(icon);
        fragment.append(anchor);
      });
      container.replaceChildren(fragment);
    });
  }

  async function loadSocialLinks() {
    if (!supabaseClient || !document.querySelector("[data-social-links]")) {
      return;
    }

    const { data, error } = await supabaseClient
      .from("social_links")
      .select("label, url, icon_key")
      .order("display_order", { ascending: true });
    if (error) {
      throw new Error(`Could not load social links: ${error.message}`);
    }
    renderSocialLinks(data || []);
  }

  async function getSettings() {
    if (!supabaseClient) {
      return null;
    }
    const { data, error } = await supabaseClient
      .from("portfolio_settings")
      .select("github_username")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      throw new Error(`Could not load portfolio settings: ${error.message}`);
    }
    return data;
  }

  async function getResumeUrl() {
    if (!supabaseClient) {
      return null;
    }

    const { data, error } = await supabaseClient
      .from("portfolio_settings")
      .select("resume_url")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      throw new Error(`Could not load resume settings: ${error.message}`);
    }
    return data?.resume_url ?? null;
  }

  function renderSkillToolItems(items) {
    const containers = {
      skill: document.querySelector('[data-managed-items="skill"]'),
      tool: document.querySelector('[data-managed-items="tool"]')
    };

    Object.entries(containers).forEach(([type, container]) => {
      if (!container) {
        return;
      }

      const fragment = document.createDocumentFragment();
      items.filter((item) => item.entry_type === type).forEach((item) => {
        if (!/^(fab|fas|far) fa-[a-z0-9-]+$/.test(item.icon_class || "")) {
          return;
        }

        const article = document.createElement("article");
        article.className = `${type === "skill" ? "skill" : "tool"}-card reveal visible`;
        const iconWrap = document.createElement("div");
        iconWrap.className = type === "skill" ? "skill-icon" : "tool-icon";
        const icon = document.createElement("i");
        icon.className = item.icon_class;
        icon.setAttribute("aria-hidden", "true");
        iconWrap.append(icon);
        const heading = document.createElement("h3");
        heading.textContent = item.name;
        const detail = document.createElement("p");
        detail.textContent = type === "skill" ? item.status : item.description;
        article.append(iconWrap, heading, detail);
        fragment.append(article);
      });
      container.replaceChildren(fragment);
    });
  }

  async function loadSkillToolItems() {
    if (!supabaseClient || !document.querySelector("[data-managed-items]")) {
      return;
    }

    const { data, error } = await supabaseClient
      .from("portfolio_skills_tools")
      .select("entry_type, name, description, status, icon_class, display_order")
      .order("display_order", { ascending: true });
    if (error) {
      throw new Error(`Could not load Skills and Tools: ${error.message}`);
    }
    renderSkillToolItems(data || []);
  }

  function normalizeProject(project) {
    return {
      slug: project.slug,
      title: project.title || "",
      category: project.category || "",
      description: project.description || "",
      technologies: Array.isArray(project.technologies) ? project.technologies : [],
      challenge: project.challenge || "",
      approach: project.approach || "",
      outcome: project.outcome || "",
      previewImage: project.preview_image_url || project.previewImage || "",
      previewType: project.preview_type || project.previewType || "concept",
      githubOwner: project.github_owner || project.githubOwner || "",
      githubRepo: project.github_repo || project.githubRepo || "",
      liveDemoUrl: project.live_demo_url || project.liveDemoUrl || "",
      displayOrder: Number(project.display_order ?? project.displayOrder ?? 0)
    };
  }

  async function loadProjectData() {
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from("projects")
        .select("*")
        .order("display_order", { ascending: true });

      if (error) {
        throw new Error(`Could not load managed projects: ${error.message}`);
      }
      if (data?.length) {
        return data.map(normalizeProject);
      }
    }

    if (location.protocol === "file:") {
      return [];
    }

    const response = await fetch("projects.json");
    if (!response.ok) {
      throw new Error(`Could not load the bundled project list (${response.status}).`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error("The bundled project list has an invalid format.");
    }
    return data.map(normalizeProject);
  }

  function addText(parent, tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    element.textContent = text;
    parent.append(element);
    return element;
  }

  function addLink(parent, href, label, icon) {
    const link = document.createElement("a");
    link.className = "project-link";
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.append(document.createTextNode(label));
    if (icon) {
      const iconElement = document.createElement("i");
      iconElement.className = icon;
      iconElement.setAttribute("aria-hidden", "true");
      link.append(iconElement);
    }
    parent.append(link);
  }

  function createProjectCard(project) {
    const article = document.createElement("article");
    article.className = "project-card reveal visible";
    article.dataset.projectCard = "";
    article.dataset.projectSlug = project.slug;
    article.dataset.technologies = project.technologies.map((item) => item.toLowerCase()).join(" ");

    const figure = document.createElement("figure");
    figure.className = "project-preview";
    const imageUrl = safeExternalUrl(project.previewImage);
    if (imageUrl) {
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = `${project.previewType === "concept" ? "Concept preview" : "Project screenshot"} for ${project.title}.`;
      image.loading = "lazy";
      figure.append(image);
    } else {
      figure.classList.add("project-preview-empty");
      addText(figure, "span", "", "Add a project screenshot in Admin");
    }
    addText(
      figure,
      "figcaption",
      "",
      project.previewType === "concept" ? "Concept preview · not a product screenshot" : "Project screenshot"
    );
    article.append(figure);

    addText(article, "span", "project-tag", project.category);
    addText(article, "h3", "", project.title);
    const tagRow = document.createElement("div");
    tagRow.className = "tag-row";
    project.technologies.forEach((technology) => addText(tagRow, "span", "tag", technology));
    article.append(tagRow);
    addText(article, "p", "", project.description);

    const study = document.createElement("details");
    study.className = "case-study";
    addText(study, "summary", "", "Read case study");
    const content = document.createElement("div");
    content.className = "case-study-content";
    [
      ["Challenge", project.challenge],
      ["Approach", project.approach],
      ["Project outcome", project.outcome]
    ].forEach(([heading, copy]) => {
      if (copy) {
        addText(content, "h4", "", heading);
        addText(content, "p", "", copy);
      }
    });
    study.append(content);
    article.append(study);

    const metrics = addText(
      article,
      "div",
      "project-metrics",
      project.githubOwner && project.githubRepo ? "Loading GitHub metrics…" : "GitHub metrics unavailable: repository not configured."
    );
    metrics.dataset.projectMetrics = "";
    metrics.dataset.repo = project.githubOwner && project.githubRepo ? `${project.githubOwner}/${project.githubRepo}` : "";

    const actions = document.createElement("div");
    actions.className = "project-actions";
    const repositoryUrl =
      project.githubOwner && project.githubRepo
        ? safeExternalUrl(`https://github.com/${encodeURIComponent(project.githubOwner)}/${encodeURIComponent(project.githubRepo)}`)
        : "";
    const demoUrl = safeExternalUrl(project.liveDemoUrl);
    if (repositoryUrl) {
      addLink(actions, repositoryUrl, "View source", "fab fa-github");
    }
    if (demoUrl) {
      addLink(actions, demoUrl, "Live demo", "fas fa-arrow-up-right-from-square");
    }
    if (!repositoryUrl || !demoUrl) {
      const missing = [];
      if (!repositoryUrl) {
        missing.push("repository");
      }
      if (!demoUrl) {
        missing.push("live demo");
      }
      addText(actions, "span", "project-unavailable", `${missing.join(" and ")} not configured`);
    }
    article.append(actions);
    return article;
  }

  function updateFilters() {
    const activeButton = document.querySelector("[data-project-filter].active");
    const filter = activeButton?.dataset.projectFilter || "all";
    const cards = [...document.querySelectorAll("[data-project-card]")];
    let visibleCount = 0;
    cards.forEach((card) => {
      const technologies = (card.dataset.technologies || "").split(/\s+/);
      const visible = filter === "all" || technologies.includes(filter);
      card.hidden = !visible;
      visibleCount += Number(visible);
    });
    const emptyState = document.getElementById("projects-empty");
    if (emptyState) {
      emptyState.hidden = visibleCount > 0;
    }
  }

  function initializeProjectFilters() {
    document.querySelectorAll("[data-project-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-project-filter]").forEach((filterButton) => {
          const isActive = filterButton === button;
          filterButton.classList.toggle("active", isActive);
          filterButton.setAttribute("aria-pressed", String(isActive));
        });
        updateFilters();
      });
    });
    updateFilters();
  }

  function readGitHubCache(path) {
    try {
      const cached = JSON.parse(localStorage.getItem(`portfolio.github.${path}`) || "null");
      if (!cached || typeof cached.cachedAt !== "number" || !("data" in cached)) {
        return null;
      }
      return cached;
    } catch (error) {
      console.warn("Could not read the GitHub response cache.", error);
      return null;
    }
  }

  function writeGitHubCache(path, data) {
    try {
      localStorage.setItem(`portfolio.github.${path}`, JSON.stringify({ cachedAt: Date.now(), data }));
    } catch (error) {
      console.warn("Could not save the GitHub response cache.", error);
    }
  }

  function githubRateLimitMessage(response, path) {
    const resetSeconds = Number(response.headers.get("x-ratelimit-reset"));
    const resetLabel = Number.isFinite(resetSeconds) && resetSeconds > 0
      ? ` Try again after ${new Date(resetSeconds * 1000).toLocaleTimeString()}.`
      : " Try again in about an hour.";
    return `GitHub's unauthenticated API rate limit has been reached (${response.status}) for ${path}.${resetLabel}`;
  }

  async function requestGitHubJson(path) {
    if (githubInFlightRequests.has(path)) {
      return githubInFlightRequests.get(path);
    }

    const cached = readGitHubCache(path);
    if (cached && Date.now() - cached.cachedAt < githubCacheTtl) {
      return cached.data;
    }

    const request = (async () => {
      try {
        const response = await fetch(`https://api.github.com/${path}`, {
          headers: { Accept: "application/vnd.github+json" }
        });
        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          const isRateLimited =
            response.status === 429 ||
            (response.status === 403 &&
              (response.headers.get("x-ratelimit-remaining") === "0" ||
                /rate limit/i.test(errorBody.message || "")));
          if (isRateLimited) {
            if (cached && Date.now() - cached.cachedAt < githubStaleCacheTtl) {
              console.warn(githubRateLimitMessage(response, path), "Using the previously cached response.");
              return cached.data;
            }
            throw new Error(githubRateLimitMessage(response, path));
          }
          const detail = errorBody.message ? ` ${errorBody.message}` : "";
          throw new Error(`GitHub API returned ${response.status} for ${path}.${detail}`);
        }

        const data = await response.json();
        writeGitHubCache(path, data);
        return data;
      } catch (error) {
        if (cached && Date.now() - cached.cachedAt < githubStaleCacheTtl) {
          console.warn(`Could not refresh GitHub data for ${path}; using cached data.`, error);
          return cached.data;
        }
        throw error;
      } finally {
        githubInFlightRequests.delete(path);
      }
    })();

    githubInFlightRequests.set(path, request);
    return request;
  }

  function activityDescription(event) {
    const name = event.repo?.name || "a repository";
    switch (event.type) {
      case "PushEvent":
        return `Pushed commits to ${name}`;
      case "CreateEvent":
        return `Created ${event.payload?.ref_type || "content"} in ${name}`;
      case "WatchEvent":
        return `Starred ${name}`;
      case "ForkEvent":
        return `Forked ${name}`;
      case "PullRequestEvent":
        return `${event.payload?.action || "Updated"} a pull request in ${name}`;
      case "IssuesEvent":
        return `${event.payload?.action || "Updated"} an issue in ${name}`;
      case "IssueCommentEvent":
        return `Commented on an issue in ${name}`;
      default:
        return `Activity in ${name}`;
    }
  }

  function renderActivity(events) {
    const list = document.getElementById("github-activity-list");
    if (!list) {
      return;
    }
    list.replaceChildren();
    events.slice(0, 5).forEach((event) => {
      const item = document.createElement("li");
      item.className = "github-activity-item";
      const repoUrl = safeExternalUrl(`https://github.com/${event.repo.name}`);
      if (repoUrl) {
        const link = document.createElement("a");
        link.href = repoUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = activityDescription(event);
        item.append(link);
      } else {
        addText(item, "span", "", activityDescription(event));
      }
      const time = document.createElement("time");
      time.dateTime = event.created_at;
      const date = new Date(event.created_at);
      time.textContent = Number.isNaN(date.valueOf()) ? "Recently" : date.toLocaleDateString();
      item.append(time);
      list.append(item);
    });
  }

  const contributionEventTypes = new Set([
    "PushEvent",
    "PullRequestEvent",
    "IssuesEvent",
    "IssueCommentEvent",
    "CreateEvent",
    "ForkEvent",
    "WatchEvent"
  ]);

  // GitHub only retains about 90 days of public events for unauthenticated requests.
  function countContributions(events) {
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    return events.reduce((total, event) => {
      if (Date.parse(event.created_at) < cutoff || !contributionEventTypes.has(event.type)) {
        return total;
      }
      if (event.type === "PushEvent") {
        return total + (Number(event.payload?.size) || event.payload?.commits?.length || 0);
      }
      return total + 1;
    }, 0);
  }

  function setStat(name, value) {
    const stat = document.querySelector(`[data-github-stat="${name}"] [data-stat-value]`);
    if (stat) {
      stat.textContent = Number(value).toLocaleString();
    }
  }

  async function loadGitHubActivity(username, projectData) {
    const status = document.getElementById("github-status");
    if (!status) {
      return;
    }
    if (!username) {
      status.textContent = "Add a valid GitHub username in Admin to load live activity and profile links.";
      return;
    }
    if (!validGitHubUsername(username)) {
      status.textContent = "The configured GitHub username is invalid. Update it in Admin.";
      return;
    }

    status.textContent = `Loading public GitHub activity for ${username}…`;
    try {
      const [profile, events] = await Promise.all([
        requestGitHubJson(`users/${encodeURIComponent(username)}`),
        requestGitHubJson(`users/${encodeURIComponent(username)}/events/public?per_page=100`)
      ]);
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const recentEvents = events.filter((event) => Date.parse(event.created_at) >= cutoff);
      setStat("repositories", profile.public_repos);
      setStat("events", recentEvents.length);
      setStat("contributions", countContributions(events));
      renderActivity(events);

      const repositories = projectData.filter((project) => project.githubOwner && project.githubRepo);
      if (!repositories.length) {
        status.textContent = `Loaded ${username}'s profile and recent public activity. Add project repository links in Admin to show stars and forks.`;
        return;
      }

      const responses = await Promise.all(
        repositories.map(async (project) => {
          const path = `repos/${encodeURIComponent(project.githubOwner)}/${encodeURIComponent(project.githubRepo)}`;
          try {
            return { project, data: await requestGitHubJson(path), error: null };
          } catch (error) {
            return { project, data: null, error };
          }
        })
      );
      let totalStars = 0;
      let totalForks = 0;
      let failedRepositories = 0;
      responses.forEach(({ project, data, error }) => {
        const metric = document.querySelector(`[data-project-metrics][data-repo="${CSS.escape(`${project.githubOwner}/${project.githubRepo}`)}"]`);
        if (error) {
          failedRepositories += 1;
          if (metric) {
            metric.textContent = `GitHub metrics unavailable: ${error.message}`;
          }
          return;
        }
        totalStars += data.stargazers_count;
        totalForks += data.forks_count;
        if (metric) {
          metric.textContent = `${data.stargazers_count} stars · ${data.forks_count} forks`;
        }
      });
      if (!failedRepositories) {
        setStat("stars", totalStars);
        setStat("forks", totalForks);
      }
      status.textContent = failedRepositories
        ? `Loaded profile activity; ${failedRepositories} configured project repository link(s) could not be verified.`
        : `Live public activity for ${username}. Recent event count covers the latest 100 public events returned by GitHub.`;
    } catch (error) {
      console.error(error);
      status.textContent = /rate limit/i.test(error.message)
        ? error.message
        : `${error.message} Check the GitHub username in Admin and try again later.`;
      status.dataset.error = "true";
    }
  }

  async function initializeContactForm() {
    const status = document.getElementById("contact-form-status");
    if (!status) {
      return;
    }

    const submittedValue = new URLSearchParams(window.location.search).get("submitted");
    const hasSubmittedForm = submittedValue === "true" || submittedValue === "1" || submittedValue === "yes" || submittedValue === "";

    if (hasSubmittedForm) {
      status.textContent = "Thanks—your message has been submitted. I’ll be in touch.";
      status.dataset.state = "success";
    }
  }

  async function initialize() {
    initializeProjectFilters();
    await initializeContactForm();

    let settings = null;
    if (supabaseClient) {
      try {
        settings = await getSettings();
      } catch (error) {
        console.error(error);
        showServiceStatus(error.message, true);
      }
    }

    const username = settings?.github_username ?? config?.githubUsername ?? "";
    configureGitHubLinks(config?.githubUsername || username);
    let resumeUrl = "/assets/pdfs/resume.pdf";
    try {
      const savedResumeUrl = await getResumeUrl();
      resumeUrl = savedResumeUrl ?? resumeUrl;
    } catch (error) {
      console.error(error);
    }
    configureResumeLinks(resumeUrl);

    try {
      await loadSocialLinks();
    } catch (error) {
      console.error(error);
    }

    try {
      await loadSkillToolItems();
    } catch (error) {
      console.error(error);
    }

    let projectData = [];
    try {
      projectData = await loadProjectData();
    } catch (error) {
      console.error(error);
      const projectStatus = document.getElementById("project-data-status");
      if (projectStatus) {
        projectStatus.textContent = error.message;
        projectStatus.dataset.error = "true";
      }
    }

    const projectGrid = document.getElementById("projects-grid");
    if (projectGrid && projectData.length) {
      projectGrid.replaceChildren(...projectData.map(createProjectCard));
      updateFilters();
    }

    await loadGitHubActivity(username, projectData);
  }

  initialize();
})();
