# Phase 3-D · Trial Observation Framework

> **Status:** 🔵 ACTIVE
> **Purpose:** Capture real workflow problems during factory trial
> **Rule:** Record only. Do not solve. Do not implement.
> **Output:** Feeds directly into Phase 4 scope decisions.

---

## 0. How to Use This Framework

```
Every time something goes wrong — a hesitation, a mistake, a workaround,
a question — record it below.

Rule of thumb:
  If the supervisor pauses for more than 5 seconds, ASK WHY.
  If the supervisor says "it would be nice if...", WRITE IT DOWN.
  If the supervisor ignores a feature, ASK WHY.
  If the supervisor opens a paper notebook, RECORD WHAT THEY LOOKED UP.

Do not fix anything during trial.
Evidence collected here determines Phase 4 priorities.
```

---

## 1. Order Creation

### 1.1 Time Required

| Order | Customer | Processes | Time (min) | Notes |
|:------|----------|:---------:|:----------:|-------|
| | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |

**Trend:** ___ min → ___ min (first 5 vs. last 5)

### 1.2 Missing Information

```
Record when the supervisor needed information NOT available in the system:

Problem:
  What information was missing?

Frequency:
  Once / Sometimes (2-5 times) / Often (5+ times)

Impact:
  Minor (workaround exists) / Medium (slows down) / High (blocks work)

Suggested Phase:
  4 (multi-user) / 5 (analytics) / Never (not DialFactory scope)

---

Problem:
Frequency:
Impact:
Suggested Phase:

---

Problem:
Frequency:
Impact:
Suggested Phase:

---
```

### 1.3 Route Building Difficulty

```
Record when the supervisor struggled to build a route:

Did they scroll up and down searching for a process?  [ ] Yes  [ ] No
  Which process? _____

Did they check a process, then uncheck it?  [ ] Yes  [ ] No
  Which process? _____  Why? _____

Did they miss a process and only realize during preview?  [ ] Yes  [ ] No
  Which process? _____

Did they say "I wish the processes were grouped differently"?  [ ] Yes  [ ] No
  How? _____

Did they say "I can't find process X"?  [ ] Yes  [ ] No
  Which process? _____

Did they refer to paper notes or memory to decide which processes?  [ ] Yes  [ ] No
  What did they reference? _____
```

### 1.4 Repeated Customer/Spec Patterns

```
Record spec combinations that appear 3+ times:

Spec Pattern             | Customer(s)       | Orders | Processes (typical)
_________________________|___________________|________|_____________________
                         |                   |        |
                         |                   |        |
                         |                   |        |
                         |                   |        |

Template candidate threshold: 10+ orders, 80%+ identical process selection.
```

---

## 2. Production Tracking

### 2.1 Current Node Visibility

```
Can the supervisor instantly answer "where is this order right now?"

Observation:
  Date: ____  Order: ____
  Did supervisor find the active node immediately?  [ ] Yes  [ ] No
  If no: What did they do? _____

  Date: ____  Order: ____
  Did supervisor find the active node immediately?  [ ] Yes  [ ] No
  If no: What did they do? _____

Pattern:
  [ ] Always finds it immediately
  [ ] Sometimes needs to scroll/search
  [ ] Often confused about which node is current
  [ ] Relies on asking someone instead of checking system
```

### 2.2 Department Handoff Clarity

```
Record when work moves from one department to another:

Observation:
  Date: ____  Order: ____  Handoff: 制__ → 制__
  Did auto-activation work correctly?  [ ] Yes  [ ] No
  Did supervisor notice the handoff immediately?  [ ] Yes  [ ] No
  Did anyone ask "has Dept-X finished yet?"  [ ] Yes  [ ] No

  Date: ____  Order: ____  Handoff: 制__ → 制__
  Did auto-activation work correctly?  [ ] Yes  [ ] No
  Did supervisor notice the handoff immediately?  [ ] Yes  [ ] No
  Did anyone ask "has Dept-X finished yet?"  [ ] Yes  [ ] No

Issues:
  Problem:
  Frequency:
  Impact:
  Suggested Phase:

  Problem:
  Frequency:
  Impact:
  Suggested Phase:
```

### 2.3 Manual Inquiries

```
Record when someone asks a question that the system should answer:

Question asked:  "Where is order X?"
Asked by: ________  Date: ____
Could the system have answered this?  [ ] Yes — Dashboard/Order List  [ ] No
If yes, why didn't they check the system? _____

---

Question asked:  "When did this order start?"
Asked by: ________  Date: ____
Could the system have answered this?  [ ] Yes — Order Detail / created_at  [ ] No
If yes, why didn't they check the system? _____

---

Question asked:  "How many orders are in Dept-2?"
Asked by: ________  Date: ____
Could the system have answered this?  [ ] Yes — Dashboard dept queue  [ ] No
If yes, why didn't they check the system? _____

---

Total manual inquiries: _____
Of these, system could answer: _____
Root cause of gap:  [ ] Feature exists but not discovered  [ ] Feature doesn't exist  [ ] UI not clear
```

---

## 3. Rework

### 3.1 Rework Event Log

```
Record every rework event:

#1  Date: ____  Order: ____  Department: 制__
    Reason: ________________________________________
    Type: A (single) / B (rewash segment) / C (full dept restart)
    Restart point (process code): ____
    Number of nodes recreated: ____
    Was correct type used?  [ ] Yes  [ ] No — should have been Type __
    Time to execute rework in system: ____ seconds

#2  Date: ____  Order: ____  Department: 制__
    Reason: ________________________________________
    Type: A (single) / B (rewash segment) / C (full dept restart)
    Restart point (process code): ____
    Number of nodes recreated: ____
    Was correct type used?  [ ] Yes  [ ] No — should have been Type __
    Time to execute rework in system: ____ seconds

#3  Date: ____  Order: ____  Department: 制__
    Reason: ________________________________________
    Type: A (single) / B (rewash segment) / C (full dept restart)
    Restart point (process code): ____
    Number of nodes recreated: ____
    Was correct type used?  [ ] Yes  [ ] No — should have been Type __
    Time to execute rework in system: ____ seconds

#4  Date: ____  Order: ____  Department: 制__
    Reason: ________________________________________
    Type: A (single) / B (rewash segment) / C (full dept restart)
    Restart point (process code): ____
    Number of nodes recreated: ____
    Was correct type used?  [ ] Yes  [ ] No — should have been Type __
    Time to execute rework in system: ____ seconds

#5  Date: ____  Order: ____  Department: 制__
    Reason: ________________________________________
    Type: A (single) / B (rewash segment) / C (full dept restart)
    Restart point (process code): ____
    Number of nodes recreated: ____
    Was correct type used?  [ ] Yes  [ ] No — should have been Type __
    Time to execute rework in system: ____ seconds

(Add rows as needed)
```

### 3.2 Rework Patterns

```
Summary after trial:

Total reworks: _____
  Type A (single): _____  (___%)
  Type B (rewash): _____  (___%)
  Type C (full dept): _____  (___%)

By department:
  制一: _____  制二: _____  制三: _____  制四: _____  总QC: _____

Most common reason: ________________________________________

Wrong type used: _____ times
  Root cause: [ ] UI confusing  [ ] Feature not discovered  [ ] Wrong mental model

Rework not recorded in system: _____ times
  (Supervisor did rework on the floor but did not record it)
  Why? ________________________________________
```

### 3.3 Rework Issues

```
Problem:
Frequency:
Impact:
Suggested Phase:

Problem:
Frequency:
Impact:
Suggested Phase:
```

---

## 4. Data Quality

### 4.1 Wrong Input Log

```
Record every data entry error:

#1  Date: ____  Field: ________
    Wrong value entered: ________
    Correct value: ________
    How was it corrected?  [ ] Undo  [ ] Cancel order  [ ] Manual edit  [ ] Left as-is
    Could system have prevented this?  [ ] Yes — validation  [ ] Yes — better UI  [ ] No

#2  Date: ____  Field: ________
    Wrong value entered: ________
    Correct value: ________
    How was it corrected?  [ ] Undo  [ ] Cancel order  [ ] Manual edit  [ ] Left as-is
    Could system have prevented this?  [ ] Yes — validation  [ ] Yes — better UI  [ ] No

#3  Date: ____  Field: ________
    Wrong value entered: ________
    Correct value: ________
    How was it corrected?  [ ] Undo  [ ] Cancel order  [ ] Manual edit  [ ] Left as-is
    Could system have prevented this?  [ ] Yes — validation  [ ] Yes — better UI  [ ] No

#4  Date: ____  Field: ________
    Wrong value entered: ________
    Correct value: ________
    How was it corrected?  [ ] Undo  [ ] Cancel order  [ ] Manual edit  [ ] Left as-is
    Could system have prevented this?  [ ] Yes — validation  [ ] Yes — better UI  [ ] No

#5  Date: ____  Field: ________
    Wrong value entered: ________
    Correct value: ________
    How was it corrected?  [ ] Undo  [ ] Cancel order  [ ] Manual edit  [ ] Left as-is
    Could system have prevented this?  [ ] Yes — validation  [ ] Yes — better UI  [ ] No

(Add rows as needed)
```

### 4.2 Correction Methods Used

```
Method            | Times Used | Effective? | Painful?
__________________|____________|____________|_________
Undo              |            |            |
Cancel + Recreate |            |            |
Left as-is        |            |            |
Manual DB edit    |            |            |
Other: _________  |            |            |
```

### 4.3 Missing Fields

```
Record information the supervisor wanted to enter but had no field for:

Field needed: ________
Purpose: ________________________________________
Frequency: Once / Sometimes / Often
Suggested Phase: 4 / 5 / Never

---

Field needed: ________
Purpose: ________________________________________
Frequency: Once / Sometimes / Often
Suggested Phase: 4 / 5 / Never

---

Field needed: ________
Purpose: ________________________________________
Frequency: Once / Sometimes / Often
Suggested Phase: 4 / 5 / Never
```

### 4.4 Data Quality Issues

```
Problem:
Frequency:
Impact:
Suggested Phase:

Problem:
Frequency:
Impact:
Suggested Phase:
```

---

## 5. Human Behavior

### 5.1 System Adoption

```
Primary user (supervisor):
  Days system was opened: _____ / _____ trial days
  Orders created in system vs. total orders received: _____ / _____
  Did supervisor ever choose paper over system?  [ ] Yes  [ ] No
    If yes: Why? ________________________________________

Other factory staff awareness:
  Did anyone else look at the system?  [ ] Yes  [ ] No
    Who? ________  Their reaction? ________
  Did anyone ask "can I use this too?"  [ ] Yes  [ ] No
    Who? ________  Department? ________
  Did anyone refuse to engage with it?  [ ] Yes  [ ] No
    Who? ________  Why? ________
```

### 5.2 Feature Usage Map

```
Feature                  | Used? | Frequency        | Useful? | Notes
_________________________|_______|__________________|_________|_______
Dashboard stat cards     | Y / N | Daily / Weekly / Never | 1-5 | 
Stalled order detection  | Y / N | Daily / Weekly / Never | 1-5 | 
Due date warnings        | Y / N | Daily / Weekly / Never | 1-5 | 
Department queue counts  | Y / N | Daily / Weekly / Never | 1-5 | 
Order List filters       | Y / N | Daily / Weekly / Never | 1-5 | 
Order List search        | Y / N | Daily / Weekly / Never | 1-5 | 
Progress bar on cards    | Y / N | Daily / Weekly / Never | 1-5 | 
Order Create — Step 1    | Y / N | —                 | 1-5 | 
Order Create — Step 2    | Y / N | —                 | 1-5 | 
Route Builder search     | Y / N | Every order / Sometimes / Never | 1-5 | 
Order Detail — flow view | Y / N | Daily / Weekly / Never | 1-5 | 
Complete node button     | Y / N | Daily / Weekly / Never | 1-5 | 
Pause node button        | Y / N | Daily / Weekly / Never | 1-5 | 
Rework button            | Y / N | Daily / Weekly / Never | 1-5 | 
Segment Rework button    | Y / N | Daily / Weekly / Never | 1-5 | 
Record Exception button  | Y / N | Daily / Weekly / Never | 1-5 | 
Undo button              | Y / N | Daily / Weekly / Never | 1-5 | 
Cancel Order button      | Y / N | Daily / Weekly / Never | 1-5 | 
Trial Cleanup button     | Y / N | Daily / Weekly / Never | 1-5 | 
Route List page          | Y / N | Daily / Weekly / Never | 1-5 | 
Exception List page      | Y / N | Daily / Weekly / Never | 1-5 | 
```

### 5.3 What Feels Unnecessary

```
Features or steps the supervisor found unnecessary:

1. ________________________________________
   Why? ________________________________________
   Frequency of complaint: Once / Sometimes / Often

2. ________________________________________
   Why? ________________________________________
   Frequency of complaint: Once / Sometimes / Often

3. ________________________________________
   Why? ________________________________________
   Frequency of complaint: Once / Sometimes / Often
```

### 5.4 What Saves Time

```
Features or steps the supervisor said saved time vs. paper:

1. ________________________________________
   Estimated time saved: ____ min per order / day

2. ________________________________________
   Estimated time saved: ____ min per order / day

3. ________________________________________
   Estimated time saved: ____ min per order / day
```

### 5.5 Human Behavior Issues

```
Problem:
Frequency:
Impact:
Suggested Phase:

Problem:
Frequency:
Impact:
Suggested Phase:

Problem:
Frequency:
Impact:
Suggested Phase:
```

---

## 6. Consolidated Issue Register

```
Collect every issue from Sections 1-5 into a single prioritized list.

Format:
  ID | Category | Problem | Frequency | Impact | Suggested Phase
  ---|----------|---------|-----------|--------|----------------
  H1 |          |         |           |        |
  H2 |          |         |           |        |
  H3 |          |         |           |        |
  H4 |          |         |           |        |
  H5 |          |         |           |        |
  H6 |          |         |           |        |
  H7 |          |         |           |        |
  H8 |          |         |           |        |
  H9 |          |         |           |        |
  H10|          |         |           |        |

Frequency:  Once / Sometimes (2-5) / Often (5-10) / Always (10+)
Impact:     Low (cosmetic) / Medium (slows work) / High (blocks work)
Phase:      4 (multi-user) / 5 (analytics) / Never (out of scope)
```

---

## 7. Weekly Observation Summary

### Week 1 — Date: ________

```
Most frequent issue: ________________________________________
Most impactful issue: ________________________________________
Surprises: ________________________________________
Supervisor mood:  [ ] Enthusiastic  [ ] Neutral  [ ] Frustrated
System uptime issues:  [ ] None  [ ] _____

Issues logged this week: _____
Of these, Phase 4 candidates: _____
Of these, out of scope: _____
```

### Week 2 — Date: ________

```
Most frequent issue: ________________________________________
Most impactful issue: ________________________________________
Surprises: ________________________________________
Supervisor mood:  [ ] Enthusiastic  [ ] Neutral  [ ] Frustrated
Behavior change from Week 1: ________________________________________

Issues logged this week: _____
Cumulative issues: _____
```

### Week 3 — Date: ________

```
Most frequent issue: ________________________________________
Most impactful issue: ________________________________________
Surprises: ________________________________________
Supervisor mood:  [ ] Enthusiastic  [ ] Neutral  [ ] Frustrated
Patterns stabilizing?  [ ] Yes  [ ] No

Issues logged this week: _____
Cumulative issues: _____
```

### Week 4 — Date: ________

```
Most frequent issue: ________________________________________
Most impactful issue: ________________________________________
Surprises: ________________________________________
Supervisor mood:  [ ] Enthusiastic  [ ] Neutral  [ ] Frustrated
Would supervisor continue using without the trial?  [ ] Yes  [ ] No

Issues logged this week: _____
Total issues: _____
Phase 4 candidates: _____
Out of scope: _____
```

---

> **This framework is a log, not a to-do list.**
> **Fill it during the trial. Review it after the trial.**
> **Every filled row is evidence for Phase 4 scope decisions.**
