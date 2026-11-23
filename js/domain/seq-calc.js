/* ============================================================
   DialFactory V1 · Gap-Based Seq Calculation
   Strategy: prefer gap insertion over global bump.
   Default step = 10. Insert: midpoint of adjacent seq values.
   ============================================================ */

const SeqCalc = (() => {

  const GAP_STEP = 10;

  /**
   * Compute gap-based insertion seq after a given position.
   * Returns { seq, needsBump, bumpFrom? }
   */
  function gapInsertion(nodes, afterSeq) {
    const sorted = [...nodes].sort((a, b) => a.seq - b.seq);
    const after = sorted.find(n => n.seq === afterSeq);

    if (!after) {
      // Fallback: if afterSeq not found, append at end
      const maxSeq = sorted.length > 0 ? Math.max(...sorted.map(n => n.seq)) : 0;
      return { seq: maxSeq + GAP_STEP, needsBump: false };
    }

    // Find the next node after 'after'
    const next = sorted.find(n => n.seq > afterSeq);
    if (!next) {
      // Insert at end: after.seq + GAP_STEP
      return { seq: afterSeq + GAP_STEP, needsBump: false };
    }

    // Gap between after and next
    const gap = next.seq - afterSeq;
    if (gap >= 2) {
      // There's room: insert at midpoint
      return { seq: Math.floor((afterSeq + next.seq) / 2), needsBump: false };
    }

    // No gap (seq are consecutive): need bump
    // New seq = afterSeq + GAP_STEP
    // Bump all nodes with seq > afterSeq by GAP_STEP
    return {
      seq: afterSeq + GAP_STEP,
      needsBump: true,
      bumpFrom: afterSeq + 1,
      bumpDelta: GAP_STEP
    };
  }

  /** Validate seq integrity */
  function validate(nodes) {
    if (!nodes || nodes.length === 0) return { valid: true };

    const sorted = [...nodes].sort((a, b) => a.seq - b.seq);
    const issues = [];
    const seen = new Set();

    for (let i = 0; i < sorted.length; i++) {
      const n = sorted[i];
      if (!Number.isInteger(n.seq) || n.seq <= 0) {
        issues.push(`节点 ${n.id?.slice(0,8)}: seq 无效 (${n.seq})`);
      }
      if (seen.has(n.seq)) {
        issues.push(`seq ${n.seq} 重复`);
      }
      seen.add(n.seq);
    }

    return { valid: issues.length === 0, issues };
  }

  return { gapInsertion, validate, GAP_STEP };
})();
