"use strict";

// Broker notice generator. Runs entirely in the browser; nothing is sent anywhere.

const ISSUES = [
  { id: "ongoing", label: "Additional insured, ongoing operations (CG 20 10)",
    text: (v) => "An additional insured endorsement for ongoing operations (CG 20 10 or equivalent) naming " + v.gc + "." },
  { id: "completed", label: "Additional insured, completed operations (CG 20 37)",
    text: (v) => "An additional insured endorsement for completed operations (CG 20 37 or equivalent) naming " + v.gc + "." },
  { id: "pnc", label: "Primary and noncontributory (CG 20 01)",
    text: () => "A primary and noncontributory endorsement (CG 20 01 or equivalent) on the general liability policy." },
  { id: "waiverGl", label: "Waiver of subrogation, general liability (CG 24 04)",
    text: (v) => "A waiver of subrogation endorsement on general liability (CG 24 04 or equivalent) in favor of " + v.gc + "." },
  { id: "waiverWc", label: "Waiver of subrogation, workers' comp (WC 00 03 13)",
    text: (v) => "A waiver of subrogation endorsement on workers' compensation (WC 00 03 13) in favor of " + v.gc + "." },
  { id: "limits", label: "General liability limits too low",
    text: (v) => "General liability limits of at least " + (v.limit || "[required limits]") + "." },
  { id: "expired", label: "A policy has lapsed",
    text: (v) => "A current certificate showing the renewed policy: " + (v.expired || "[policy and expiration date]") + "." },
  { id: "wc", label: "No workers' comp on the certificate",
    text: () => "Evidence of workers' compensation and employers' liability coverage." },
  { id: "holder", label: "Certificate holder is wrong",
    text: (v) => "The certificate holder updated to " + v.gc + "." }
];

function el(tag, attrs, text) {
  const node = document.createElement(tag);
  if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
  if (text != null) node.textContent = text;
  return node;
}

function initNoticeTool() {
  const form = document.getElementById("notice-form");
  if (!form) return;
  const issuesBox = document.getElementById("n-issues");
  for (const issue of ISSUES) {
    const id = "n-issue-" + issue.id;
    const wrap = el("div", { class: "issue" });
    wrap.append(el("input", { type: "checkbox", id, name: "issue", value: issue.id }), el("label", { for: id }, issue.label));
    issuesBox.append(wrap);
  }
  form.querySelector("#n-issue-completed").checked = true;

  // Remember the visitor's own company name on this device only.
  const gcInput = document.getElementById("n-gc");
  try { gcInput.value = localStorage.getItem("cf-gc-name") || ""; } catch {}

  const output = document.getElementById("n-output");
  const mailto = document.getElementById("n-mailto");
  const limitField = document.getElementById("n-limit-field");
  const expiredField = document.getElementById("n-expired-field");

  const val = (id) => document.getElementById(id).value.trim();

  const render = () => {
    const v = {
      broker: val("n-broker"),
      brokerEmail: val("n-broker-email"),
      sub: val("n-sub") || "[subcontractor]",
      policy: val("n-policy"),
      gc: val("n-gc") || "[your company]",
      project: val("n-project"),
      limit: val("n-limit"),
      expired: val("n-expired"),
      days: val("n-days"),
      hold: val("n-hold")
    };
    try { if (val("n-gc")) localStorage.setItem("cf-gc-name", val("n-gc")); } catch {}

    const picked = ISSUES.filter((i) => document.getElementById("n-issue-" + i.id).checked);
    limitField.hidden = !picked.some((i) => i.id === "limits");
    expiredField.hidden = !picked.some((i) => i.id === "expired");

    const subject = "Certificate update needed: " + v.sub + (v.project ? ", " + v.project : "");
    const lines = picked.length
      ? picked.map((i, n) => (n + 1) + ". " + i.text(v))
      : ["[Tick at least one item under \"What's missing or wrong\"]"];

    const body = [
      "Hello " + (v.broker ? v.broker + " team" : "there") + ",",
      "",
      "We reviewed the certificate of insurance for " + v.sub +
        (v.policy ? " (policy " + v.policy + ")" : "") +
        (v.project ? " on our " + v.project + " project" : "") +
        ". To meet the insurance requirements in our subcontract, we need:",
      "",
      ...lines,
      "",
      "Please reply to this email with the updated certificate and endorsement pages within " + v.days + " business days. " +
        (v.hold === "hold"
          ? v.sub + "'s site access is on hold until we receive them."
          : v.sub + " can keep working while this is in progress."),
      "",
      "Thank you,",
      v.gc
    ].join("\n");

    output.textContent = (v.brokerEmail ? "To: " + v.brokerEmail + "\n" : "") + "Subject: " + subject + "\n\n" + body;
    mailto.href = "mailto:" + encodeURIComponent(v.brokerEmail) +
      "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  };

  form.addEventListener("input", render);
  form.addEventListener("change", render);
  render();

  const copy = document.getElementById("n-copy");
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(output.textContent);
      copy.textContent = "Copied";
    } catch {
      const range = document.createRange();
      range.selectNodeContents(output);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      copy.textContent = "Text selected";
    }
    setTimeout(() => (copy.textContent = "Copy text"), 2000);
  });
}

initNoticeTool();
