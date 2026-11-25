/* FreshCut Rwanda — progressive enhancements.
   The page works without JavaScript (the booking form posts normally and
   lands on /thank-you); this file adds live opening status, smarter date and
   time picking, inline validation and an in-page success state. */
(function () {
  "use strict";

  var doc = document.documentElement;
  doc.classList.add("js");

  var TIMEZONE = "Africa/Kigali";
  var OPEN_MIN = 8 * 60;   // 8:00
  var CLOSE_MIN = 19 * 60; // 19:00
  var LEAD_MIN = 30;       // earliest same-day slot is at least 30 min from now
  var BOOK_AHEAD_DAYS = 60;
  var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  /* ---------- Kigali clock ---------- */
  function kigaliNow() {
    var parts = {};
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TIMEZONE,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });

    var iso = parts.year + "-" + parts.month + "-" + parts.day;
    return {
      iso: iso,
      day: dayOfWeek(iso),
      minutes: Number(parts.hour) * 60 + Number(parts.minute)
    };
  }

  function dayOfWeek(iso) {
    var b = iso.split("-").map(Number);
    return new Date(Date.UTC(b[0], b[1] - 1, b[2])).getUTCDay();
  }

  function addDays(iso, n) {
    var b = iso.split("-").map(Number);
    var d = new Date(Date.UTC(b[0], b[1] - 1, b[2] + n));
    return d.toISOString().slice(0, 10);
  }

  function isWorkday(day) { return day >= 1 && day <= 6; }

  /* ---------- Open / closed status ---------- */
  var dot = document.querySelector("[data-status-dot]");
  var label = document.querySelector("[data-status-label]");
  var detail = document.querySelector("[data-status-detail]");

  function updateStatus() {
    var now = kigaliNow();
    var open = isWorkday(now.day) && now.minutes >= OPEN_MIN && now.minutes < CLOSE_MIN;
    var next;

    if (open) {
      next = "Closes today at 7 PM";
    } else if (isWorkday(now.day) && now.minutes < OPEN_MIN) {
      next = "Opens today at 8 AM";
    } else if (now.day >= 1 && now.day <= 5) {
      next = "Opens tomorrow at 8 AM";
    } else {
      next = "Opens Monday at 8 AM";
    }

    if (dot) {
      dot.classList.toggle("is-open", open);
      dot.classList.toggle("is-closed", !open);
    }
    if (label) label.textContent = open ? "Open now" : "Closed now";
    if (detail) detail.textContent = next + " (Kigali time)";

    var rows = document.querySelectorAll(".hours tr[data-day]");
    rows.forEach(function (row) {
      row.classList.toggle("is-today", Number(row.getAttribute("data-day")) === now.day);
    });
  }

  updateStatus();
  setInterval(updateStatus, 60 * 1000);

  var year = document.querySelector("[data-year]");
  if (year) year.textContent = kigaliNow().iso.slice(0, 4);

  /* ---------- Header + mobile nav ---------- */
  var header = document.querySelector("[data-header]");
  var toggle = document.querySelector("[data-nav-toggle]");
  var nav = document.querySelector("[data-nav]");

  function onScroll() {
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  function setNav(open) {
    if (!toggle || !nav) return;
    toggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      setNav(toggle.getAttribute("aria-expanded") !== "true");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) setNav(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setNav(false);
        toggle.focus();
      }
    });
    window.matchMedia("(min-width: 761px)").addEventListener("change", function (mq) {
      if (mq.matches) setNav(false);
    });
  }

  /* ---------- Reveal on scroll ---------- */
  var targets = document.querySelectorAll(".menu__item, .step, .hours, .visit__intro, .booking");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    targets.forEach(function (el) {
      el.classList.add("in-view-target");
      io.observe(el);
    });
  }

  /* ---------- Booking form ---------- */
  var form = document.querySelector("[data-booking-form]");
  if (!form) return;

  form.noValidate = true; // JS takes over validation; native validation stays on without JS

  var dateInput = form.elements.date;
  var timeSelect = form.elements.time;
  var submitBtn = form.querySelector("[data-submit]");
  var submitLabel = form.querySelector("[data-submit-label]");
  var statusEl = form.querySelector("[data-form-status]");
  var done = document.querySelector("[data-booking-done]");
  var doneSummary = document.querySelector("[data-done-summary]");

  function slotMinutes(text) {
    var m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(text.trim());
    if (!m) return NaN;
    var h = Number(m[1]) % 12;
    if (m[3].toUpperCase() === "PM") h += 12;
    return h * 60 + Number(m[2]);
  }

  function setDateBounds() {
    var today = kigaliNow().iso;
    dateInput.min = today;
    dateInput.max = addDays(today, BOOK_AHEAD_DAYS);
  }

  // Disable time slots that have already passed when the chosen day is today.
  function refreshSlots() {
    var now = kigaliNow();
    var isToday = dateInput.value === now.iso;
    var anyOpen = false;

    Array.prototype.forEach.call(timeSelect.options, function (opt) {
      if (!opt.value) return;
      var past = isToday && slotMinutes(opt.value) < now.minutes + LEAD_MIN;
      opt.disabled = past;
      if (!past) anyOpen = true;
    });

    if (timeSelect.selectedOptions[0] && timeSelect.selectedOptions[0].disabled) {
      timeSelect.value = "";
    }
    return anyOpen;
  }

  function fieldWrap(name) {
    var el = form.querySelector('[data-error-for="' + name + '"]');
    return el ? el.closest(".field") : null;
  }

  function setError(name, message) {
    var el = form.querySelector('[data-error-for="' + name + '"]');
    var wrap = fieldWrap(name);
    if (el) el.textContent = message || "";
    if (wrap) wrap.classList.toggle("has-error", Boolean(message));

    var control = form.elements[name];
    if (control && control.setAttribute && !(control instanceof RadioNodeList)) {
      if (message) control.setAttribute("aria-invalid", "true");
      else control.removeAttribute("aria-invalid");
    }
  }

  var validators = {
    name: function () {
      var v = form.elements.name.value.trim();
      if (!v) return "Please tell us your name.";
      if (v.length < 2) return "That name looks too short.";
      return "";
    },
    phone: function () {
      var raw = form.elements.phone.value.trim();
      if (!raw) return "We need a phone number to confirm your booking.";
      if (!/^[+\d\s().-]+$/.test(raw)) return "Use digits only, e.g. 078 123 4567.";
      var digits = raw.replace(/\D/g, "");
      if (digits.length < 9 || digits.length > 15) return "Please check the number, e.g. 078 123 4567 or +250 78 123 4567.";
      return "";
    },
    service: function () {
      return form.elements.service.value ? "" : "Pick a service.";
    },
    date: function () {
      var v = dateInput.value;
      if (!v) return "Choose a day.";
      if (v < dateInput.min) return "That day has already passed.";
      if (v > dateInput.max) return "We take requests up to " + BOOK_AHEAD_DAYS + " days ahead.";
      if (dayOfWeek(v) === 0) return "We're closed on Sundays. Pick Monday to Saturday.";
      if (!refreshSlots()) return "No times left today. Try tomorrow.";
      return "";
    },
    time: function () {
      return timeSelect.value ? "" : "Choose a time.";
    }
  };

  function validate(name) {
    var msg = validators[name]();
    setError(name, msg);
    return !msg;
  }

  function validateAll() {
    var firstBad = null;
    Object.keys(validators).forEach(function (name) {
      if (!validate(name) && !firstBad) firstBad = name;
    });
    if (firstBad) {
      var el = form.elements[firstBad];
      (el instanceof RadioNodeList ? el[0] : el).focus();
    }
    return !firstBad;
  }

  setDateBounds();
  refreshSlots();

  // Validate a field once the visitor leaves it, then live while they correct it.
  ["name", "phone"].forEach(function (name) {
    var el = form.elements[name];
    el.addEventListener("blur", function () { if (el.value) validate(name); });
    el.addEventListener("input", function () {
      if (fieldWrap(name).classList.contains("has-error")) validate(name);
    });
  });
  dateInput.addEventListener("change", function () {
    validate("date");
    if (timeSelect.value === "" && fieldWrap("time").classList.contains("has-error")) validate("time");
  });
  timeSelect.addEventListener("change", function () { validate("time"); });
  form.addEventListener("change", function (e) {
    if (e.target.name === "service") validate("service");
  });

  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitBtn.classList.toggle("is-loading", loading);
    submitLabel.textContent = loading ? "Sending" : "Send request";
  }

  function formatDay(iso) {
    var b = iso.split("-").map(Number);
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "long", day: "numeric", month: "long", timeZone: "UTC"
    }).format(new Date(Date.UTC(b[0], b[1] - 1, b[2])));
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    statusEl.textContent = "";
    statusEl.classList.remove("is-error");

    setDateBounds();
    if (!validateAll()) {
      statusEl.textContent = "Please fix the highlighted fields.";
      statusEl.classList.add("is-error");
      return;
    }

    var data = new FormData(form);
    if (!data.has("form-name")) data.append("form-name", form.getAttribute("name"));

    setLoading(true);
    fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(data).toString()
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Request failed with status " + res.status);

        var service = String(data.get("service")).replace(/\s*\(.*\)$/, "");
        if (doneSummary) {
          doneSummary.textContent = "Thanks, " + String(data.get("name")).trim() + ". You asked for a " +
            service + " on " + formatDay(String(data.get("date"))) + " at " + data.get("time") +
            ". We'll call " + String(data.get("phone")).trim() + " shortly to confirm.";
        }
        form.reset();
        refreshSlots();
        form.hidden = true;
        done.hidden = false;
        done.focus();
      })
      .catch(function () {
        statusEl.textContent = "Sorry, your request didn't go through. Check your connection and try again.";
        statusEl.classList.add("is-error");
      })
      .then(function () { setLoading(false); });
  });

  var again = document.querySelector("[data-book-again]");
  if (again && done) {
    again.addEventListener("click", function () {
      done.hidden = true;
      form.hidden = false;
      form.elements.name.focus();
    });
  }
})();
