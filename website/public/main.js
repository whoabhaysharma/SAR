document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.mobile-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      links.classList.toggle('open');
    });
    document.querySelectorAll('.nav-links a').forEach(link => {
      link.addEventListener('click', () => links.classList.remove('open'));
    });
    const navClose = document.querySelector('.nav-close');
    if (navClose) {
      navClose.addEventListener('click', () => links.classList.remove('open'));
    }
    document.addEventListener('click', (e) => {
      if (!toggle.contains(e.target) && !links.contains(e.target)) {
        links.classList.remove('open');
      }
    });
  }

  document.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.parentElement;
      const answer = item.querySelector('.faq-a');
      const isOpen = btn.classList.contains('open');
      document.querySelectorAll('.faq-q.open').forEach(b => {
        if (b !== btn) {
          b.classList.remove('open');
          b.parentElement.querySelector('.faq-a').style.maxHeight = '0';
        }
      });
      btn.classList.toggle('open');
      answer.style.maxHeight = isOpen ? '0' : answer.scrollHeight + 'px';
    });
  });
});
