# Phase 3-B · Rework Model

> **Status:** Design
> **Principle:** Three-level rework. Zero schema changes. All supported by existing node model.

---

## 1. Three Levels

| Level | Name | Scope | Trigger | V1.1 |
|:-----:|------|-------|---------|:----:|
| A | 单工序返工 | 1 node | Single process failure | YES |
| B | 部门段返工 | Dept segment | Contamination, partial failure | YES |
| C | 全流程返工 | All nodes | Catastrophic failure | Phase 4 |

**Dept-2 (制二) is the primary rework department.**

## 2. Type A — Single Node

```
Scenario: P16 plating color slightly off.

Action: [Rework] on P16.

Result:
  INSERT 1 new P16 node
  rework_pass = parent.rework_pass + 1
  status = 'active'
  seq = gap-based after original P16
  Original P16: status='done', preserved
```

## 3. Type B — Partial Segment (Rewash)

```
Scenario: Surface contamination after P15.
  Must wash (P21) + redo P15 + redo P16.

Action: [Segment Rework] on P15.
  Supervisor selects restart range: P21 -> P15 -> P16.

Result:
  Batch INSERT 3 nodes:
    P21 (wash):    rework_pass+1, active
    P15 (sunray):  rework_pass+1, waiting
    P16 (plating): rework_pass+1, waiting
  Original nodes preserved: done
  Seq: gap-based after original segment
```

## 4. Type C — Full Segment (Dept Restart)

```
Scenario: P16 plating completely failed.
  Restart from P12 (first Dept-2 process).

Action: [Dept Rework] on P16.
  System auto-detects Dept-2 first process: P12.
  Range: P12 -> P13 -> P15 -> P16.

Result:
  Batch INSERT 4 nodes:
    P12 (grinding):  rework_pass+1, active
    P13 (sandblast): rework_pass+1, waiting
    P15 (sunray):    rework_pass+1, waiting
    P16 (plating):   rework_pass+1, waiting
  P17 onwards: NOT recreated (already done)
  Original P12-P16: preserved
```

## 5. Node Model Support

```
Requirement              Supported by
─────────────────────────────────────────
Batch INSERT             order_nodes INSERT (existing)
Same rework_pass         rework_pass column (existing)
Original preserved       status='done' (existing)
Multiple same process_id Differentiated by seq + rework_pass
Segment boundary         dept_id grouping (existing)
Gap-based seq            SeqCalc.gapInsertion (existing)
Order status recalc      OrderState.derive (existing)

Schema change: NONE
```

## 6. Visual Distinction

```
rework_pass=0: normal (green done, blue active)
rework_pass=1: light orange background
rework_pass=2: medium orange background
rework_pass>=3: dark orange background

Original and rework nodes coexist in flow.
History fully preserved.
```

## 7. Error Recovery for Rework

```
Wrong rework scope:
  Type A used when Type C needed:
    -> Do Type C on original node.
    -> Both rework generations visible.
    -> Complete correct one, ignore wrong one.
  Rework nodes are production records. Never deleted.
```
