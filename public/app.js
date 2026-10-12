"use strict";

// Sample reviews shown in the hero. All names, brokers and policy numbers are fictional.
const SCENARIOS = {
  framing: {
    status: "warn",
    stamp: "Action needed",
    broker: "Mesa Ridge Insurance Group",
    insured: "Lone Pine Framing LLC",
    coverages: [
      ["Commercial general liability", "03/14/2027", "$1M each occurrence / $2M aggregate", true],
      ["Automobile liability", "03/14/2027", "$1M combined single limit", true],
      ["Workers’ comp and employers’ liability", "01/01/2027", "Statutory, EL $1M each accident", true],
      ["Umbrella", "03/14/2027", "$2M each occurrence", true]
    ],
    endorsements: [["CG 20 10", true], ["CG 20 37", false], ["CG 24 04", true], ["WC 00 03 13", true]],
    note: "CG 20 37 isn’t attached. Limits and dates pass, but you aren’t an additional insured for claims that surface after handover, like a framing defect found next year.",
    notice:
      "To: certificates@mesaridge.example\n" +
      "Subject: Missing CG 20 37 for Lone Pine Framing LLC\n\n" +
      "Hello Mesa Ridge team,\n\n" +
      "We reviewed the certificate for Lone Pine Framing LLC (GL policy CGL-4418207). The ongoing operations endorsement (CG 20 10) is attached, but our subcontract also requires completed operations coverage (CG 20 37 or equivalent) naming Harbor & Main Builders as additional insured.\n\n" +
      "Please reply with the endorsement page attached and we’ll update their file.\n\n" +
      "Thank you,\nHarbor & Main Builders"
  },
  hvac: {
    status: "pass",
    stamp: "Verified",
    broker: "Cobalt Commercial Insurance",
    insured: "Northgate Mechanical Inc.",
    coverages: [
      ["Commercial general liability", "06/15/2027", "$1M each occurrence / $2M aggregate", true],
      ["Automobile liability", "06/15/2027", "$1M combined single limit", true],
      ["Workers’ comp and employers’ liability", "06/15/2027", "Statutory, EL $1M each accident", true],
      ["Umbrella", "06/15/2027", "$5M each occurrence", true]
    ],
    endorsements: [["CG 20 10", true], ["CG 20 37", true], ["CG 24 04", true], ["WC 00 03 13", true]],
    note: "Everything matches the project requirements. The next check is scheduled 30 days before the policies renew on 06/15/2027.",
    notice:
      "No notice needed. Northgate Mechanical’s file is complete.\n\n" +
      "A renewal request goes to Cobalt Commercial Insurance on 05/16/2027, and the new certificate is reviewed the same way when it arrives."
  },
  roofing: {
    status: "fail",
    stamp: "Stop work",
    broker: "Bellmont Underwriting Services",
    insured: "Tri-Valley Roofing Co.",
    coverages: [
      ["Commercial general liability", "11/30/2026", "$1M each occurrence / $2M aggregate", true],
      ["Automobile liability", "11/30/2026", "$1M combined single limit", true],
      ["Workers’ comp and employers’ liability", "09/26/2026", "Lapsed. No renewal on file", false],
      ["Umbrella", "11/30/2026", "$1M each occurrence", true]
    ],
    endorsements: [["CG 20 10", true], ["CG 20 37", true], ["CG 24 04", true], ["WC 00 03 13", false]],
    note: "Workers’ comp lapsed on 09/26/2026. A roofing crew is on site without coverage, and an injury claim can fall back on you as the general contractor. GL also renews in under 60 days.",
    notice:
      "To: service@bellmont.example\n" +
      "Subject: Urgent: lapsed workers’ comp for Tri-Valley Roofing Co.\n\n" +
      "Hello Bellmont team,\n\n" +
      "Our records show workers’ compensation policy WC-2093371 for Tri-Valley Roofing Co. expired on 09/26/2026. Their site access is on hold until we receive a current certificate showing renewed coverage and the WC 00 03 13 waiver of subrogation in favor of Harbor & Main Builders.\n\n" +
      "Please reply with the updated certificate as soon as it’s bound.\n\n" +
      "Thank you,\nHarbor & Main Builders"
  }
};

function el(tag, attrs, text) {
  const node = document.createElement(tag);
  if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
  if (text != null) node.textContent = text;
  return node;
}

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let scanRun = 0; // bumps on every render so an older scan stops when the tab changes

function renderScenario(key, animate) {
  const s = SCENARIOS[key];
  const sheet = document.getElementById("sheet");
  const field = (name) => document.querySelector('[data-field="' + name + '"]');
  const progress = field("progress");
  const run = ++scanRun;
  const scan = animate && !REDUCED_MOTION;

  field("broker").textContent = s.broker;
  field("insured").textContent = s.insured;

  const stamp = field("stamp");
  stamp.textContent = s.stamp;
  stamp.dataset.status = s.status;
  stamp.classList.remove("is-new");

  const body = field("coverages");
  body.replaceChildren();
  const steps = [];
  for (const [type, exp, limits, ok] of s.coverages) {
    const tr = el("tr");
    const typeCell = el("td");
    typeCell.append(el("span", ok ? null : { class: "mark" }, type));
    tr.append(typeCell, el("td", null, exp), el("td", null, limits));
    const res = el("td", { class: "res " + (ok ? "res-pass" : "res-fail") }, ok ? "✓" : "✕");
    res.append(el("span", { class: "visually-hidden" }, ok ? " meets requirement" : " fails requirement"));
    tr.append(res);
    body.append(tr);
    steps.push(tr);
  }

  const list = field("endorsements");
  list.replaceChildren();
  for (const [form, present] of s.endorsements) {
    const li = el("li", present ? null : { class: "missing" }, present ? form : form + " missing");
    list.append(li);
    steps.push(li);
  }

  const note = field("note");
  note.textContent = s.note;
  note.dataset.status = s.status;
  field("notice").textContent = s.notice;
  sheet.setAttribute("aria-labelledby", "tab-" + key);

  const failures = s.coverages.filter((c) => !c[3]).length + s.endorsements.filter((e) => !e[1]).length;
  const summary = failures
    ? "Reviewed " + steps.length + " items: " + failures + (failures === 1 ? " problem found" : " problems found")
    : "Reviewed " + steps.length + " items: all meet the requirements";

  const finish = () => {
    sheet.classList.remove("is-scanning");
    sheet.classList.add("is-done");
    progress.textContent = summary;
    progress.dataset.status = s.status;
    if (scan) stamp.classList.add("is-new");
  };

  if (!scan) {
    steps.forEach((n) => n.classList.add("is-checked"));
    finish();
    return;
  }

  // One orchestrated moment: rows are ticked off top to bottom, then the stamp lands.
  sheet.classList.remove("is-done");
  sheet.classList.remove("is-scanning");
  void sheet.offsetWidth; // restart the scan-line animation
  sheet.style.setProperty("--scan-end", sheet.offsetHeight + "px");
  sheet.classList.add("is-scanning");
  progress.dataset.status = "";
  progress.textContent = "Checking against project requirements…";
  steps.forEach((n, i) => {
    setTimeout(() => {
      if (run === scanRun) n.classList.add("is-checked");
    }, 180 + i * 150);
  });
  setTimeout(() => { if (run === scanRun) finish(); }, 260 + steps.length * 150);
}

function initTabs() {
  const tabs = Array.from(document.querySelectorAll('.tabs [role="tab"]'));
  if (!tabs.length) return;
  tabs.forEach((t) => (t.dataset.status = SCENARIOS[t.dataset.scenario].status));

  const select = (tab, focus) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    });
    renderScenario(tab.dataset.scenario, true);
    if (focus) tab.focus();
  };

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (e) => {
      let next = null;
      if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
      if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
      if (e.key === "Home") next = tabs[0];
      if (e.key === "End") next = tabs[tabs.length - 1];
      if (next) { e.preventDefault(); select(next, true); }
    });
  });

  renderScenario(tabs[0].dataset.scenario, true);
}

function initCopy() {
  const btn = document.getElementById("copy-notice");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const text = document.querySelector('[data-field="notice"]').textContent;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
    } catch {
      // Clipboard API blocked: select the text so the visitor can copy it manually.
      const range = document.createRange();
      range.selectNodeContents(document.querySelector('[data-field="notice"]'));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      btn.textContent = "Text selected";
    }
    setTimeout(() => (btn.textContent = "Copy text"), 2000);
  });
}

// ---------- Certificate self-check ----------
const SELF_CHECK = [
  {
    id: "gl", short: "GL limits",
    q: "Does general liability meet your contract, usually $1M each occurrence and $2M aggregate?",
    gap: "General liability is below what your contract requires. A claim over the limit comes back to you."
  },
  {
    id: "ongoing", short: "CG 20 10",
    q: "Is there an additional insured endorsement for ongoing operations (CG 20 10 or equivalent) naming your company?",
    gap: "No ongoing-operations endorsement. A checked box on the ACORD 25 alone doesn’t make you an additional insured."
  },
  {
    id: "completed", short: "CG 20 37",
    q: "Is there a completed operations endorsement (CG 20 37 or equivalent)?",
    gap: "No completed-operations endorsement. Claims that surface after handover, like defects, won’t reach this sub’s policy."
  },
  {
    id: "waiver", short: "Waiver",
    q: "If your contract requires it, is a waiver of subrogation endorsement attached (CG 24 04, and WC 00 03 13 for workers’ comp)?",
    gap: "No waiver of subrogation. The sub’s carrier can pursue you to recover what it pays out."
  },
  {
    id: "wc", short: "Workers’ comp",
    q: "Is workers’ compensation listed and currently in force?",
    gap: "Workers’ comp is missing or lapsed. An injured worker’s claim can fall to you as the general contractor."
  },
  {
    id: "dates", short: "Dates",
    q: "Do all policies run at least 30 days past today?",
    gap: "A policy expires within 30 days. Without a renewal certificate, you’ll be back here next month."
  }
];
const SC_OPTIONS = [["yes", "Yes"], ["no", "No"], ["unsure", "Not sure"]];

function initSelfCheck() {
  const form = document.getElementById("sc-form");
  if (!form) return;

  SELF_CHECK.forEach((item, i) => {
    const fs = el("fieldset", { class: "sc-q" });
    const legend = el("legend");
    legend.append(el("span", { class: "sc-n", "aria-hidden": "true" }, String(i + 1)), el("span", null, item.q));
    fs.append(legend);
    const opts = el("div", { class: "sc-opts" });
    for (const [value, label] of SC_OPTIONS) {
      const id = "sc-" + item.id + "-" + value;
      const input = el("input", { type: "radio", name: item.id, id, value });
      const lab = el("label", { for: id, class: "sc-opt sc-opt-" + value }, label);
      opts.append(input, lab);
    }
    fs.append(opts);
    form.append(fs);
  });

  const title = document.getElementById("sc-title");
  const body = document.getElementById("sc-body");
  const gaps = document.getElementById("sc-gaps");
  const cta = document.getElementById("sc-cta");
  const fill = document.getElementById("sc-meter-fill");
  const result = document.getElementById("sc-result");

  let wasComplete = false;
  const update = () => {
    const answers = SELF_CHECK.map((item) => {
      const checked = form.querySelector('input[name="' + item.id + '"]:checked');
      return checked ? checked.value : null;
    });
    const answered = answers.filter(Boolean).length;
    const no = SELF_CHECK.filter((_, i) => answers[i] === "no");
    const unsure = SELF_CHECK.filter((_, i) => answers[i] === "unsure");

    fill.style.width = (answered / SELF_CHECK.length) * 100 + "%";
    gaps.replaceChildren();
    for (const item of no) gaps.append(el("li", { class: "sc-gap-no" }, item.gap));
    for (const item of unsure) gaps.append(el("li", { class: "sc-gap-unsure" }, item.short + ": worth confirming. This is exactly the kind of detail we check."));

    let state = "idle";
    if (no.length) {
      state = "fail";
      title.textContent = no.length === 1 ? "1 gap on this certificate" : no.length + " gaps on this certificate";
      body.textContent = "If one sub’s file looks like this, others probably do too. Send us 5–10 and we’ll find them.";
    } else if (unsure.length) {
      state = "warn";
      title.textContent = "Some answers need a closer look";
      body.textContent = "Endorsement pages are hard to read and easy to miss. We’ll check them for you.";
    } else if (answered === SELF_CHECK.length) {
      state = "pass";
      title.textContent = "This certificate looks solid";
      body.textContent = "That’s one sub. A free trial checks the rest the same way, in 24 hours.";
    } else if (answered) {
      title.textContent = "So far, so good";
      body.textContent = (SELF_CHECK.length - answered) + " questions to go.";
    }
    result.dataset.state = state;
    cta.hidden = answered === 0;

    // On narrow screens the result sits below the questions; bring it into view once.
    const complete = answered === SELF_CHECK.length;
    if (complete && !wasComplete) {
      const r = result.getBoundingClientRect();
      if (r.top > window.innerHeight || r.bottom < 0) {
        result.scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth", block: "center" });
      }
    }
    wasComplete = complete;

    const summary = answered
      ? "gaps: " + (no.map((g) => g.short).join(", ") || "none") +
        "; unsure: " + (unsure.map((g) => g.short).join(", ") || "none") +
        "; answered " + answered + "/" + SELF_CHECK.length
      : "";
    // Kept for this tab so the onboarding form in the account page can include it.
    try { sessionStorage.setItem("cf-selfcheck", summary); } catch {}
  };

  form.addEventListener("change", update);
  update();
}

// ---------- Where the visitor came from ----------
function readSource() {
  const params = new URLSearchParams(location.search);
  const parts = [];
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "ref"]) {
    if (params.get(key)) parts.push(key + "=" + params.get(key).slice(0, 80));
  }
  if (document.referrer) {
    try {
      const host = new URL(document.referrer).host;
      if (host && host !== location.host) parts.push("referrer=" + host);
    } catch {}
  }
  const current = parts.join("; ");
  // Keep the first-touch source for this tab so in-page navigation doesn't erase it.
  try {
    const stored = sessionStorage.getItem("cf-source");
    if (stored) return stored;
    if (current) sessionStorage.setItem("cf-source", current);
  } catch {}
  return current;
}
readSource(); // remembers the first-touch source in sessionStorage for the onboarding form

function initChrome() {
  const header = document.querySelector(".site-header");
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Phone-only bar: shown once the hero is out of view, hidden again near the form.
  const bar = document.getElementById("sticky-cta");
  const hero = document.querySelector(".hero");
  const request = document.getElementById("request");
  const selfCheck = document.getElementById("self-check");
  if (!bar || !hero || !request || !("IntersectionObserver" in window)) return;
  bar.hidden = false;
  document.documentElement.classList.add("js-sticky"); // phone header drops its button; the bar takes over
  let heroVisible = true;
  let formVisible = false;
  let checkVisible = false;
  const update = () => bar.classList.toggle("is-visible", !heroVisible && !formVisible && !checkVisible);
  new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; update(); }).observe(hero);
  new IntersectionObserver(([e]) => { formVisible = e.isIntersecting; update(); }, { threshold: 0.05 }).observe(request);
  if (selfCheck) new IntersectionObserver(([e]) => { checkVisible = e.isIntersecting; update(); }).observe(selfCheck);
}

function initPrint() {
  const btn = document.getElementById("print-guide");
  if (btn) btn.addEventListener("click", (e) => { e.preventDefault(); window.print(); });
}

initTabs();
initCopy();
initSelfCheck();
initChrome();
initPrint();

// ---------- Guilloché engraving: the certificate seal and the security-paper patterns ----------
const SVG_NS = "http://www.w3.org/2000/svg";

function engrave(svg, d, stroke, width, opacity, rotate) {
  const p = document.createElementNS(SVG_NS, "path");
  p.setAttribute("d", d);
  p.setAttribute("fill", "none");
  p.setAttribute("stroke", stroke);
  p.setAttribute("stroke-width", width);
  p.setAttribute("stroke-opacity", opacity);
  p.setAttribute("class", "g-line");
  if (rotate) p.setAttribute("transform", "rotate(" + rotate.toFixed(3) + ")");
  svg.append(p);
  return p;
}

// A woven ring: phase-shifted sine waves wrapped around a circle.
function ring(svg, radius, amp, waves, strands, stroke, width, opacity, rotate) {
  for (let s = 0; s < strands; s++) {
    const phase = (s / strands) * Math.PI * 2;
    let d = "";
    for (let i = 0; i <= 720; i++) {
      const t = (i / 720) * Math.PI * 2;
      const r = radius + amp * Math.sin(waves * t + phase);
      d += (i ? "L" : "M") + (r * Math.cos(t)).toFixed(2) + " " + (r * Math.sin(t)).toFixed(2);
    }
    engrave(svg, d + "Z", stroke, width, opacity, rotate);
  }
}

function initEngraving() {
  const brass = "#A8834A", ink = "#13233A", lightBrass = "#CDB07A";

  const seal = document.querySelector("[data-seal]");
  if (seal) {
    ring(seal, 90, 4.5, 40, 5, brass, 0.5, 0.95);
    ring(seal, 78, 2.5, 64, 3, brass, 0.4, 0.8);
    // Interlaced petal mesh in two inks, like two-colour intaglio.
    for (let k = 0; k < 14; k++) ring(seal, 47, 22, 12, 1, k % 2 ? brass : ink, 0.4, k % 2 ? 0.85 : 0.45, (k * 30) / 14);
    const type = document.createElementNS(SVG_NS, "g");
    type.setAttribute("class", "seal-type");
    const circle = (r, attrs) => {
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("r", r);
      for (const k in attrs) c.setAttribute(k, attrs[k]);
      return c;
    };
    const word = document.createElementNS(SVG_NS, "text");
    word.setAttribute("class", "seal-core");
    word.setAttribute("text-anchor", "middle");
    word.setAttribute("y", "4");
    word.setAttribute("font-size", "12.5");
    word.textContent = "Verified";
    type.append(
      circle(28, { fill: "#FAFAF7" }),
      circle(28, { fill: "none", stroke: brass, "stroke-width": "0.8" }),
      circle(24.5, { fill: "none", stroke: brass, "stroke-width": "0.4" }),
      word
    );
    seal.append(type);
    seal.querySelectorAll(".g-line").forEach((p) => p.style.setProperty("--len", Math.ceil(p.getTotalLength())));
  }

  const band = document.querySelector("[data-band]");
  if (band) {
    for (let s = 0; s < 5; s++) {
      const phase = (s / 5) * Math.PI * 2;
      let d = "";
      for (let x = 0; x <= 400; x++) d += (x ? "L" : "M") + x + " " + (7 + 5 * Math.sin(x / 6 + phase)).toFixed(2);
      const p = engrave(band, d, brass, 0.5, 1);
      p.removeAttribute("class");
      p.setAttribute("vector-effect", "non-scaling-stroke");
    }
  }

  const rosette = document.querySelector("[data-rosette]");
  if (rosette) {
    ring(rosette, 94, 3, 72, 6, lightBrass, 0.2, 1);
    ring(rosette, 84, 5, 44, 6, lightBrass, 0.2, 1);
    for (let j = 0; j < 9; j++) ring(rosette, 48, 28, 14, 1, lightBrass, 0.22, 1, (j * 360) / 14 / 9);
    ring(rosette, 14, 4, 18, 6, lightBrass, 0.2, 1);
  }

  // Engrave the seal once the coverage lines have been confirmed (timing lives in the CSS).
  const cert = document.getElementById("hero-cert");
  if (cert) requestAnimationFrame(() => requestAnimationFrame(() => cert.classList.add("is-verified")));
}

initEngraving();

// ---------- Plan picker and Google sign-up link ----------
const SIGNUP_ERRORS = {
  cancelled: "Google sign-in was cancelled. Pick a plan and try again when you’re ready.",
  expired: "That sign-in took too long or was opened in another tab. Please try again.",
  google: "Google couldn’t confirm your account. Please try again, or use a different Google account.",
  unavailable: "Sign-up opens shortly. Email support@certiflowapp.com and we’ll start your trial for you."
};

function initPlanPickers() {
  const params = new URLSearchParams(location.search);
  document.querySelectorAll("[data-signup]").forEach((box) => {
    const link = box.querySelector("[data-google-link]");
    const radios = Array.from(box.querySelectorAll('input[name="plan"]'));
    const wanted = radios.find((r) => r.value === params.get("plan"));
    if (wanted) wanted.checked = true;
    const sync = () => {
      const checked = radios.find((r) => r.checked);
      if (link && checked) link.href = "/auth/google?plan=" + encodeURIComponent(checked.value);
    };
    radios.forEach((r) => r.addEventListener("change", sync));
    sync();
  });
  const error = document.getElementById("signup-error");
  const message = SIGNUP_ERRORS[params.get("error")];
  if (error && message) {
    error.textContent = message;
    error.hidden = false;
  }
}

initPlanPickers();
