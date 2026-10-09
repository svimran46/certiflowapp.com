# Day 1 Execution Guide: From Absolute Zero to First Conversations

**Workspace:** `saas-discovery/`  
**Target:** 18 Verified Mid-Market Commercial General Contractors in [`initial-prospect-list.csv`](file:///c:/Users/User/Downloads/saas-discovery/initial-prospect-list.csv)  
**Objective:** Book 3–5 free Subcontractor Compliance Audits within 48 hours to validate pain and secure pilot commitments.

---

## 1. The Strategy: The "Audit Hook" (Why This Works)

Do **NOT** say: *"I am an AI developer building a SaaS."*  
Instead, position yourself as a **Compliance & Risk Specialist**:

> *"We run a free 24-hour compliance audit on 5–10 of your active subcontractor insurance certificates (ACORD 25s) to identify missing 'Additional Insured' endorsements (CG 20 10 / CG 20 37) or expired coverage limits before your insurance carrier's annual audit."*

---

## 2. Personalized Email Templates

### Template A: Targeting the VP of Finance / Office Administrator
*(Example: Sarah Rogers or Shera Fagg at Novel Builders)*

**Subject:** *Subcontractor COI compliance & carrier audit prep / Novel Builders*

> Hi Sarah,
> 
> I saw that Novel Builders manages commercial interiors and finish-outs across DFW. 
> 
> Most commercial GCs managing 30+ active trade partners have their office team spend 8–12 hours a week tracking subcontractor insurance certificates in spreadsheets—and still fear carrier audit penalties because a subcontractor's PDF was missing the CG 20 10 "Additional Insured" endorsement.
> 
> We are running a complimentary **Subcontractor Insurance Gap Audit** for DFW commercial builders this week.
> 
> If you email over 5 to 10 of your current subcontractor ACORD 25 certificates, we will run a full policy limit, expiration date, and endorsement clause audit, and return a clean 1-page "Executive Gap Report" showing any compliance blindspots.
> 
> No cost, no sales pitch. Would you be open to having us audit a small sample of your subcontractor files this week?
> 
> Best regards,  
> **[Your Name]**  
> Founder, CertiFlow  
> [Your Phone Number] | [Your LinkedIn or Website]

---

### Template B: Targeting Dedicated Compliance / Prequalification Leads
*(Example: J. Smith at Ripa Construction)*

**Subject:** *Quick question on subcontractor COI & W9 verification / Ripa Construction*

> Hi [First Name],
> 
> I noticed you coordinate subcontractor prequalification and insurance documentation for Ripa Construction.
> 
> Reviewing ACORD 25s, tracking down missing waivers of subrogation, and chasing down brokers for updated endorsements can be an endless manual headache when handling dozens of trade partners.
> 
> We developed a streamlined verification workflow specifically for commercial trade contractors. To demonstrate how it works, we’re offering a free 24-hour compliance audit on 5 of your active subcontractor certificates.
> 
> We’ll check all coverage limits, policy expirations, and attached endorsements, and hand you back an audit-ready summary sheet.
> 
> Could I run a 5-certificate test for your team this week?
> 
> Best regards,  
> **[Your Name]**  
> Founder, CertiFlow  
> [Your Phone Number]

---

## 3. The 30-Second Phone Script (If Calling Office Lines)

When calling the office line:
> *"Hi, my name is [Name]. I’m calling to see who in your office handles subcontractor insurance compliance and annual carrier audit paperwork?"*

When transferred to the Office Manager / Operations Lead:
> *"Hi [Name], I’ll be brief. We help commercial general contractors in [City] audit their subcontractor ACORD 25 certificates for missing 'Additional Insured' endorsements and expired policies before their insurance carrier audits them.*
> 
> *I’m offering a free compliance check on 5 of your active subcontractor certificates this week just to get feedback from local builders. If I send you a quick email, would you be open to forwarding over a few sample PDFs for a 1-page gap report?"*

---

## 4. The "Audit Machine": How to Perform the Audit in 60 Seconds (No Code)

When a contractor forwards 5 subcontractor PDFs, you don't need a finished SaaS backend. You use this exact Vision LLM prompt in Google Gemini or ChatGPT:

### The Auditor Prompt:
```markdown
You are a commercial construction insurance compliance auditor.
Examine this uploaded ACORD 25 Certificate of Liability Insurance and any attached endorsement pages.

Extract and evaluate against standard commercial GC requirements:
1. Insured Subcontractor Name & Trade
2. Producer (Insurance Broker) Name, Email, & Phone Number
3. Commercial General Liability:
   - Each Occurrence Limit (Pass if >= $1,000,000)
   - General Aggregate Limit (Pass if >= $2,000,000)
   - Policy Expiration Date (Flag if expired or expiring within 30 days)
   - "Additional Insured" box checked? (Yes/No)
   - "Subrogation Waived" box checked? (Yes/No)
4. Endorsements Attached:
   - Is form CG 20 10 (Ongoing Operations) present?
   - Is form CG 20 37 (Completed Operations) present?
   - Is form CG 24 04 (Waiver of Subrogation) present?
5. Certificate Holder:
   - Is the General Contractor specifically listed as Certificate Holder?

Output a clean, bulleted "Compliance Status Report":
- Status: COMPLIANT / ACTION REQUIRED
- Critical Deficiencies: (List exact missing forms, low limits, or upcoming expiration dates)
- Recommended Broker Action: (Draft a 2-sentence email to the broker requesting the missing endorsements)
```

---

## 5. The "Executive Gap Report" Deliverable (What You Send Back)

Format the findings into a clean, branded email or 1-page PDF:

```
===================================================================
EXECUTIVE SUBCONTRACTOR COMPLIANCE AUDIT
Prepared for: [Contractor Name] | Date: October 2026
Audited by: CertiFlow Compliance Audit Desk
===================================================================

Summary: 5 Subcontractor Certificates Audited
• 3 Compliant (Active coverage, limits verified)
• 2 Critical Action Required (Lapsed policy / Missing endorsement)

DETAILED FINDINGS:

1. Apex Framing LLC (Framing & Drywall)
   - Status: 🔴 CRITICAL ACTION REQUIRED
   - General Liability Limit: $1,000,000 / $2,000,000 (PASSED)
   - Expiration Date: November 14, 2026 (Expiring in 35 days)
   - DEFICIENCY: Certificate Holder box lists GC, but attached endorsement 
     pages do NOT include CG 20 37 (Completed Operations). 
   - RISK: In the event of a structural defect after project turnover, 
     your insurance carrier will deny coverage.

2. Lone Star Mechanical (HVAC / MEP)
   - Status: 🟢 COMPLIANT
   - All limits meet or exceed project requirements. Full endorsements attached.

3. Tri-County Roofing (Commercial Roofing)
   - Status: 🔴 CRITICAL ACTION REQUIRED
   - Workers Comp Expiration: EXPIRED (Lapsed 12 days ago).
   - RISK: Immediate tort liability in the event of a jobsite fall.

===================================================================
RECOMMENDED NEXT STEPS:
We can automatically dispatch formal deficiency notices directly to 
Apex Framing's broker (Wortham Insurance) and Tri-County Roofing to collect 
rectified certificates within 48 hours.
===================================================================
```

---

## 6. The Pitch (Converting the Audit into Your First Paid Customer)

When you deliver the gap report, the contractor will see **real holes** in their spreadsheet tracking. 

Send this follow-up message:

> *"As you can see, Apex Framing is missing completed operations coverage and Tri-County's Workers Comp actually lapsed 12 days ago. Your current spreadsheet missed both.*
> 
> *We are launching an automated web portal that continuously monitors all 40+ of your subcontractors, automatically alerts brokers 30 days before expiration, and verifies endorsements for **$49/month** (instead of the $5,000/year enterprise tools charge).*
> 
> *We are accepting 3 local General Contractors for our founding beta. Would you like to reserve a spot for your company?"*

If they say yes $\rightarrow$ **You have your first paying customer before writing a single line of production code.**
