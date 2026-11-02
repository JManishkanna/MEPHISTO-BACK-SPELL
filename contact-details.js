(async () => {
  try {
    const response = await fetch('/api/contact-details', { cache: 'no-store' });
    if (!response.ok) return;
    const details = await response.json();
    if (!details) return;
    document.querySelectorAll('[data-contact-email]').forEach(link => {
      link.href = `mailto:${details.email}`;
    });
    document.querySelectorAll('[data-contact-phone]').forEach(link => {
      link.href = `tel:${details.phone.replace(/[^+\d]/g, '')}`;
    });
    document.querySelectorAll('[data-contact-email-text]').forEach(element => { element.textContent = details.email; });
    document.querySelectorAll('[data-contact-phone-text]').forEach(element => { element.textContent = details.phone; });
    document.querySelectorAll('[data-contact-location]').forEach(element => { element.textContent = details.location; });
  } catch {
    // Keep the published contact details visible if the service is unavailable.
  }
})();
