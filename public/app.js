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
      ["Workers' comp and employers' liability", "01/01/2027", "Statutory, EL $1M each accident", true],
      ["Umbrella", "03/14/2027", "$2M each occurrence", true]
    ],
    endorsements: [["CG 20 10", true], ["CG 20 37", false], ["CG 24 04", true], ["WC 00 03 13", true]],
    note: "CG 20 37 isn't attached. Limits and dates pass, but you aren't an additional insured for claims that surface after handover, like a framing defect found next year.",
    notice:
      "To: certificates@mesaridge.example\n" +
      "Subject: Missing CG 20 37 for Lone Pine Framing LLC\n\n" +
      "Hello Mesa Ridge team,\n\n" +
      "We reviewed the certificate for Lone Pine Framing LLC (GL policy CGL-4418207). The ongoing operations endorsement (CG 20 10) is attached, but our subcontract also requires completed operations coverage (CG 20 37 or equivalent) naming Harbor & Main Builders as additional insured.\n\n" +
      "Please reply with the endorsement page attached and we'll update their file.\n\n" +
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
      ["Workers' comp and employers' liability", "06/15/2027", "Statutory, EL $1M each accident", true],
      ["Umbrella", "06/15/2027", "$5M each occurrence", true]
    ],
    endorsements: [["CG 20 10", true], ["CG 20 37", true], ["CG 24 04", true], ["WC 00 03 13", true]],
    note: "Everything matches the project requirements. The next check is scheduled 30 days before the policies renew on 06/15/2027.",
    notice:
      "No notice needed. Northgate Mechanical's file is complete.\n\n" +
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
      ["Workers' comp and employers' liability", "09/26/2026", "Lapsed. No renewal on file", false],
      ["Umbrella", "11/30/2026", "$1M each occurrence", true]
    ],
    endorsements: [["CG 20 10", true], ["CG 20 37", true], ["CG 24 04", true], ["WC 00 03 13", false]],
    note: "Workers' comp lapsed on 09/26/2026. A roofing crew is on site without coverage, and an injury claim can fall back on you as the general contractor. GL also renews in under 60 days.",
    notice:
      "To: service@bellmont.example\n" +
      "Subject: Urgent: lapsed workers' comp for Tri-Valley Roofing Co.\n\n" +
      "Hello Bellmont team,\n\n" +
      "Our records show workers' compensation policy WC-2093371 for Tri-Valley Roofing Co. expired on 09/26/2026. Their site access is on hold until we receive a current certificate showing renewed coverage and the WC 00 03 13 waiver of subrogation in favor of Harbor & Main Builders.\n\n" +
      "Please reply with the updated certificate as soon as it's bound.\n\n" +
      "Thank you,\nHarbor & Main Builders"
  }
};

function el(tag, attrs, text) {
  const node = document.createElement(tag);
  if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
  if (text != null) node.textContent = text;
  return node;
}

function renderScenario(key, animate) {
  const s = SCENARIOS[key];
  const sheet = document.getElementById("sheet");
  const field = (name) => document.querySelector('[data-field="' + name + '"]');

  field("broker").textContent = s.broker;
  field("insured").textContent = s.insured;

  const stamp = field("stamp");
  stamp.textContent = s.stamp;
  stamp.dataset.status = s.status;
  if (animate) {
    stamp.classList.remove("is-new");
    void stamp.offsetWidth; // restart the animation
    stamp.classList.add("is-new");
  }

  const body = field("coverages");
  body.replaceChildren();
  for (const [type, exp, limits, ok] of s.coverages) {
    const tr = el("tr");
    const typeCell = el("td");
    const typeText = el("span", ok ? null : { class: "mark" }, type);
    typeCell.append(typeText);
    tr.append(typeCell, el("td", null, exp));
    const limitCell = el("td", null, limits);
    tr.append(limitCell);
    const res = el("td", { class: "res " + (ok ? "res-pass" : "res-fail") }, ok ? "✓" : "✕");
    res.append(el("span", { class: "visually-hidden" }, ok ? " meets requirement" : " fails requirement"));
    tr.append(res);
    body.append(tr);
  }

  const list = field("endorsements");
  list.replaceChildren();
  for (const [form, present] of s.endorsements) {
    list.append(el("li", present ? null : { class: "missing" }, present ? form : form + " missing"));
  }

  const note = field("note");
  note.textContent = s.note;
  note.dataset.status = s.status;

  field("notice").textContent = s.notice;
  sheet.setAttribute("aria-labelledby", "tab-" + key);
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

  renderScenario(tabs[0].dataset.scenario, false);
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

function mailtoFallback(data) {
  const body =
    "Company: " + data.company + "\nName: " + data.name + "\nEmail: " + data.email +
    "\nPhone: " + (data.phone || "") + "\nActive subcontractors: " + data.subs + "\n\n" + (data.notes || "");
  return "mailto:support@certiflowapp.com?subject=" + encodeURIComponent("Free COI audit request: " + data.company) +
    "&body=" + encodeURIComponent(body);
}

function initForm() {
  const form = document.getElementById("audit-form");
  if (!form) return;
  const status = document.getElementById("form-status");
  const submit = document.getElementById("form-submit");

  const setStatus = (msg, kind, link) => {
    status.className = "form-status" + (kind ? " is-" + kind : "");
    status.textContent = msg;
    if (link) {
      status.append(" ");
      status.append(el("a", { href: link.href }, link.text));
    }
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const required = ["f-company", "f-name", "f-email"];
    let firstBad = null;
    for (const id of required) {
      const input = document.getElementById(id);
      const ok = input.value.trim() !== "" && input.checkValidity();
      input.setAttribute("aria-invalid", String(!ok));
      if (!ok && !firstBad) firstBad = input;
    }
    if (firstBad) {
      const label = form.querySelector('label[for="' + firstBad.id + '"]').textContent.replace(/\(optional\)/, "").trim();
      setStatus(firstBad.id === "f-email" && firstBad.value.trim()
        ? "Enter a valid email address, like name@company.com."
        : "Fill in " + label.toLowerCase() + " to continue.", "error");
      firstBad.focus();
      return;
    }

    const data = Object.fromEntries(new FormData(form).entries());
    submit.disabled = true;
    submit.textContent = "Sending…";
    setStatus("", null);

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      form.reset();
      setStatus("Request received. We'll email " + data.email + " within one business day with where to send your certificates.", "ok");
      submit.textContent = "Request sent";
    } catch {
      setStatus("The request didn't go through.", "error", { href: mailtoFallback(data), text: "Send it by email instead" });
      submit.disabled = false;
      submit.textContent = "Request my free audit";
    }
  });
}

initTabs();
initCopy();
initForm();
