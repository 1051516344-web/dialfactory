/* ============================================================
   DialFactory V1 · Node State Machine
   ADL-003: waiting / active / done / paused
   ============================================================ */

const NodeState = (() => {

  const TRANSITIONS = {
    'waiting': { valid: ['active'],                           terminal: false },
    'active':  { valid: ['done', 'paused'],                   terminal: false },
    'paused':  { valid: ['active'],                           terminal: false },
    'done':    { valid: [],                                   terminal: true  }
  };

  /** Validate a status transition */
  function validate(from, to) {
    const entry = TRANSITIONS[from];
    if (!entry) return { valid: false, error: `未知状态: ${from}` };
    if (entry.valid.includes(to)) return { valid: true };
    return { valid: false, error: `不允许从 ${from} 转换到 ${to}` };
  }

  /** Check if status is terminal */
  function isTerminal(status) {
    return TRANSITIONS[status]?.terminal === true;
  }

  /** Check if status can receive child nodes (rework / append) */
  function canCreateChild(status) {
    return status !== 'waiting';
  }

  /** Get available actions for a node */
  function getAvailableActions(node) {
    const s = node.status;
    const actions = [];

    if (s === 'active') {
      actions.push('advance', 'pause', 'append', 'record_exception');
    } else if (s === 'paused') {
      actions.push('resume', 'append', 'record_exception');
    } else if (s === 'done') {
      actions.push('rework', 'append', 'record_exception');
    }
    // waiting: no actions

    return actions;
  }

  return { validate, isTerminal, canCreateChild, getAvailableActions, TRANSITIONS };
})();
