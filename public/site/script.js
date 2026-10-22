/* =========================================================
   Grad2Tech — demo interactions
   No data is stored or sent anywhere. All forms are demo-only.
   ========================================================= */
(function () {
  'use strict';

  window.G2T_READY = true;

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mobileNav = window.matchMedia('(max-width: 960px)');

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* ---------- Header state & back-to-top ---------- */
  var header = $('#site-header');
  var toTop = $('.to-top');
  var ticking = false;

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    header.classList.toggle('is-scrolled', y > 12);
    toTop.classList.toggle('is-visible', y > window.innerHeight * 1.2);
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { window.requestAnimationFrame(onScroll); ticking = true; }
  }, { passive: true });
  onScroll();

  toTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    // Return keyboard focus to the start of the page.
    var mark = $('.site-header .wordmark');
    if (mark) mark.focus({ preventScroll: true });
  });

  /* ---------- Mobile navigation ---------- */
  var navToggle = $('.nav-toggle');
  var navList = $('#nav-list');

  function setMenu(open, returnFocus) {
    navToggle.setAttribute('aria-expanded', String(open));
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    navList.classList.toggle('is-open', open);
    header.classList.toggle('menu-open', open);
    if (open) {
      // Wait a frame so the panel is visible (and therefore focusable).
      window.requestAnimationFrame(function () {
        var first = $('a', navList);
        if (first && menuIsOpen()) first.focus();
      });
    } else if (returnFocus) {
      navToggle.focus();
    }
  }
  function menuIsOpen() { return navToggle.getAttribute('aria-expanded') === 'true'; }

  navToggle.addEventListener('click', function () { setMenu(!menuIsOpen(), false); });

  navList.addEventListener('click', function (e) {
    if (e.target.closest('a, button') && menuIsOpen()) setMenu(false, false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menuIsOpen()) setMenu(false, true);
  });

  document.addEventListener('click', function (e) {
    if (menuIsOpen() && !e.target.closest('.site-header')) setMenu(false, false);
  });

  // Keep focus inside the open mobile menu.
  header.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab' || !menuIsOpen()) return;
    var items = [navToggle].concat($$('a, button', navList));
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  function onBreakpoint() { if (!mobileNav.matches && menuIsOpen()) setMenu(false, false); }
  if (mobileNav.addEventListener) mobileNav.addEventListener('change', onBreakpoint);
  else if (mobileNav.addListener) mobileNav.addListener(onBreakpoint);

  /* ---------- Collapsible panels (accordions & roadmap) ---------- */
  function setCollapsible(panel, open, duration) {
    clearTimeout(panel._g2tTimer);
    if (reduceMotion.matches) {
      panel.classList.remove('is-animating');
      panel.style.height = '';
      panel.classList.toggle('is-open', open);
      return;
    }
    var start;
    if (open) {
      start = panel.classList.contains('is-open') ? panel.getBoundingClientRect().height : 0;
      panel.classList.add('is-open');
    } else {
      start = panel.getBoundingClientRect().height;
    }
    var end = open ? panel.scrollHeight : 0;
    panel.classList.remove('is-animating');
    panel.style.height = start + 'px';
    void panel.offsetHeight; // commit start height before transitioning
    panel.classList.add('is-animating');
    panel.style.height = end + 'px';
    panel._g2tTimer = setTimeout(function () {
      panel.classList.remove('is-animating');
      panel.style.height = '';
      if (!open) panel.classList.remove('is-open');
    }, duration);
  }

  $$('[data-accordion]').forEach(function (acc) {
    var triggers = $$('.acc-trigger', acc);

    triggers.forEach(function (btn, i) {
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      btn.addEventListener('click', function () {
        var open = btn.getAttribute('aria-expanded') !== 'true';
        btn.setAttribute('aria-expanded', String(open));
        setCollapsible(panel, open, 340);
      });
      // Arrow-key movement between accordion headers.
      btn.addEventListener('keydown', function (e) {
        var target = null;
        if (e.key === 'ArrowDown') target = triggers[(i + 1) % triggers.length];
        else if (e.key === 'ArrowUp') target = triggers[(i - 1 + triggers.length) % triggers.length];
        else if (e.key === 'Home') target = triggers[0];
        else if (e.key === 'End') target = triggers[triggers.length - 1];
        if (target) { e.preventDefault(); target.focus(); }
      });
    });
  });

  var roadmapToggle = $('#roadmap-toggle');
  var roadmapPanel = $('#roadmap-panel');
  roadmapToggle.addEventListener('click', function () {
    var open = roadmapToggle.getAttribute('aria-expanded') !== 'true';
    roadmapToggle.setAttribute('aria-expanded', String(open));
    $('span', roadmapToggle).textContent = open ? 'Hide Learning Roadmap' : 'View Learning Roadmap';
    setCollapsible(roadmapPanel, open, 400);
    if (open) {
      setTimeout(function () {
        var rect = roadmapPanel.getBoundingClientRect();
        if (rect.top > window.innerHeight * 0.6) {
          roadmapPanel.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
        }
      }, 420);
    }
  });

  /* ---------- Modals ---------- */
  var lastOpener = null;
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function resetModal(dialog) {
    var formView = $('[data-form-view]', dialog);
    var successView = $('[data-success-view]', dialog);
    var form = $('form', dialog);
    if (formView) formView.hidden = false;
    if (successView) successView.hidden = true;
    if (form) clearErrors(form);
  }

  function openModal(id, opener) {
    var dialog = document.getElementById(id);
    if (!dialog) return;
    if (menuIsOpen()) setMenu(false, false);
    $$('dialog[open]').forEach(function (d) { d.close(); });
    lastOpener = opener || document.activeElement;
    resetModal(dialog);

    var topic = opener && opener.getAttribute('data-topic');
    if (topic) {
      var select = $('select[name="topic"]', dialog);
      if (select) {
        $$('option', select).forEach(function (o) { if (o.textContent.indexOf(topic) === 0) select.value = o.value; });
      }
    }

    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    root.classList.add('modal-open');

    var firstField = $('input:not([type="hidden"]), select, textarea', dialog);
    (firstField || $(FOCUSABLE, dialog)).focus();
  }

  function closeModal(dialog) {
    if (typeof dialog.close === 'function') dialog.close();
    else { dialog.removeAttribute('open'); onModalClosed(); }
  }

  function onModalClosed() {
    if (!$('dialog[open]')) root.classList.remove('modal-open');
    if (lastOpener && document.contains(lastOpener)) lastOpener.focus();
    lastOpener = null;
  }

  document.addEventListener('click', function (e) {
    var opener = e.target.closest('[data-open]');
    if (opener) { e.preventDefault(); openModal(opener.getAttribute('data-open'), opener); }
  });

  $$('dialog.modal').forEach(function (dialog) {
    dialog.addEventListener('close', onModalClosed);

    dialog.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { closeModal(dialog); return; }
      // Clicking the backdrop (the dialog element itself, outside the content) closes it.
      if (e.target === dialog) {
        var r = dialog.getBoundingClientRect();
        var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) closeModal(dialog);
      }
    });

    // Explicit focus loop so Tab never leaves the dialog.
    dialog.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && typeof dialog.showModal !== 'function') { closeModal(dialog); return; }
      if (e.key !== 'Tab') return;
      var items = $$(FOCUSABLE, dialog).filter(function (el) { return el.offsetParent !== null || el === document.activeElement; });
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  });

  /* ---------- Form validation ---------- */
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var PHONE = /^\+?[\d\s().-]+$/;

  function digits(v) { return (v.match(/\d/g) || []).length; }

  var rules = {
    name: function (v) { return v.trim().length >= 2 ? '' : 'Please enter your name.'; },
    email: function (v) {
      if (!v.trim()) return 'Please enter your email address.';
      return EMAIL.test(v.trim()) ? '' : 'Please enter a valid email address, like name@example.com.';
    },
    phone: function (v) {
      if (!v.trim()) return 'Please enter your phone number.';
      return PHONE.test(v.trim()) && digits(v) >= 7 && digits(v) <= 15 ? '' : 'Please enter a valid phone number (7–15 digits).';
    },
    year: function (v) { return v ? '' : 'Please select your graduation year.'; },
    background: function (v) { return v ? '' : 'Please select your current background.'; },
    goal: function (v) { return v.trim().length >= 10 ? '' : 'Please describe your career goal in a sentence or two (at least 10 characters).'; },
    message: function (v) { return v.trim().length >= 10 ? '' : 'Please write your question (at least 10 characters).'; }
  };

  function errorEl(field) {
    var ids = (field.getAttribute('aria-describedby') || '').split(/\s+/);
    for (var i = 0; i < ids.length; i++) {
      if (/-err$/.test(ids[i])) return document.getElementById(ids[i]);
    }
    return null;
  }

  function setError(field, msg) {
    var el = errorEl(field);
    if (msg) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
    if (el) el.textContent = msg;
  }

  function clearErrors(form) {
    form.removeAttribute('data-touched');
    $$('[aria-invalid]', form).forEach(function (f) { f.removeAttribute('aria-invalid'); });
    $$('.field__error', form).forEach(function (el) { el.textContent = ''; });
    var summary = $('.form__summary', form);
    if (summary) summary.textContent = '';
  }

  // Returns a list of invalid elements (fields or fieldsets) in document order.
  function validate(form) {
    var invalid = [];

    $$('input, select, textarea', form).forEach(function (field) {
      if (field.type === 'radio') return;
      var msg = '';
      if (field.type === 'checkbox') {
        if (field.required && !field.checked) msg = 'Please confirm that you understand the selection process.';
      } else if (rules[field.name] && (field.required || field.value)) {
        msg = rules[field.name](field.value);
      }
      setError(field, msg);
      if (msg) invalid.push(field);
    });

    $$('fieldset.options', form).forEach(function (fs) {
      var checked = $('input[type="radio"]:checked', fs);
      var msg = checked ? '' : 'Please choose a guidance topic.';
      setError(fs, msg);
      if (msg) invalid.push(fs);
    });

    return invalid;
  }

  function showSuccess(form) {
    var dialog = form.closest('dialog');
    var formView = $('[data-form-view]', dialog);
    var successView = $('[data-success-view]', dialog);
    var echo = $('[data-topic-echo]', successView);
    if (echo) {
      var picked = $('input[type="radio"]:checked', form);
      echo.textContent = picked ? picked.value : '—';
    }
    // Nothing is stored or transmitted — just clear the form.
    form.reset();
    clearErrors(form);
    updateCounters(form);
    formView.hidden = true;
    successView.hidden = false;
    successView.focus();
  }

  $$('form.form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      form.setAttribute('data-touched', 'true');
      var invalid = validate(form);
      var summary = $('.form__summary', form);
      if (invalid.length) {
        if (summary) {
          summary.textContent = invalid.length === 1
            ? 'Please correct the highlighted field.'
            : 'Please correct the ' + invalid.length + ' highlighted fields.';
        }
        var target = invalid[0].tagName === 'FIELDSET' ? $('input', invalid[0]) : invalid[0];
        target.focus();
        return;
      }
      showSuccess(form);
    });

    // After the first submit attempt, re-check as the visitor corrects fields.
    function recheck() {
      if (form.getAttribute('data-touched') !== 'true') return;
      var invalid = validate(form);
      var summary = $('.form__summary', form);
      if (summary && !invalid.length) summary.textContent = '';
    }
    form.addEventListener('input', recheck);
    form.addEventListener('change', recheck);
  });

  // Graduation years: a few years ahead (final-year students) back to fifteen years ago.
  var yearSelect = $('#ap-year');
  if (yearSelect) {
    var now = new Date().getFullYear();
    for (var y = now + 2; y >= now - 15; y--) {
      var opt = document.createElement('option');
      opt.value = opt.textContent = String(y);
      yearSelect.appendChild(opt);
    }
    var earlier = document.createElement('option');
    earlier.value = 'earlier';
    earlier.textContent = 'Earlier than ' + (now - 15);
    yearSelect.appendChild(earlier);
  }

  // Character counters.
  function updateCounters(scope) {
    $$('[data-count]', scope).forEach(function (el) {
      var field = document.getElementById(el.getAttribute('data-count'));
      if (field) el.textContent = field.value.length;
    });
  }
  $$('[data-count]').forEach(function (el) {
    var field = document.getElementById(el.getAttribute('data-count'));
    if (field) field.addEventListener('input', function () { el.textContent = field.value.length; });
  });

  /* ---------- Scroll reveal ---------- */
  var reveals = $$('.reveal');
  reveals.forEach(function (el) {
    // Small stagger between sibling reveals that enter together.
    var siblings = $$(':scope > .reveal', el.parentElement);
    var idx = siblings.indexOf(el);
    if (idx > 0) el.style.setProperty('--rd', Math.min(idx, 4) * 80 + 'ms');
  });

  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    reveals.forEach(function (el) { revealObserver.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------- Active navigation link ---------- */
  var navLinks = $$('.nav__list a[href^="#"]');
  var linkFor = {};
  navLinks.forEach(function (a) { linkFor[a.getAttribute('href').slice(1)] = a; });
  var spySections = Object.keys(linkFor).map(function (id) { return document.getElementById(id); }).filter(Boolean);

  if ('IntersectionObserver' in window && spySections.length) {
    var visible = {};
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { visible[entry.target.id] = entry.isIntersecting; });
      var current = null;
      spySections.forEach(function (s) { if (visible[s.id] && !current) current = s.id; });
      navLinks.forEach(function (a) {
        var active = current && a === linkFor[current];
        a.classList.toggle('is-active', !!active);
        if (active) a.setAttribute('aria-current', 'location');
        else a.removeAttribute('aria-current');
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    spySections.forEach(function (s) { spy.observe(s); });
  }
})();
