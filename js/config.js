/* ============================================================
   DialFactory V1 · Configuration
   ============================================================ */

const CONFIG = {
  // Supabase
  SUPABASE_URL: 'https://wzfkmwrqnvjegunjueka.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6Zmttd3JxbnZqZWd1bmp1ZWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5ODExNTksImV4cCI6MjEwMTU1NzE1OX0.Y8IVY-epnh_0gBpumzyDSy6W8mEtVX8mrwd4ExngL2M',

  // Order image recognition — 现在指向公网阿里云 OCR Edge Function（recognize-order-ocr）。
  // 备用（本地 OCR 服务，切回时改回这一行即可）：
  //   http://localhost:3200/api/extract
  // 备用（Vision 模型 Edge Function）：
  //   https://wzfkmwrqnvjegunjueka.supabase.co/functions/v1/recognize-order
  RECOGNIZE_URL: 'https://wzfkmwrqnvjegunjueka.supabase.co/functions/v1/recognize-order-ocr',

  // Business
  STALL_DAYS: 3,
  UNDO_WINDOW_MINUTES: 5,

  // Department order (for cross-dept flow)
  DEPT_ORDER: ['制一', '制二', '制三', '制四', '总QC'],

  // Phase 4: Process configuration for production tracking
  // These process_names are used to group production status on the dashboard.
  // Add/remove entries here to change the process list — no code changes needed.
  PROCESS_CONFIG: ['开模', '冲板', '切窗', '磨板', '刷纹', '喷砂', '电镀', '喷漆', '网印', '装钉'],

  // Phase 4: Alert when production stays at one process > 24h
  PROD_STALL_HOURS: 24,

  // Pagination
  PAGE_SIZE: 20,

  // Status Labels
  STATUS_LABELS: {
    waiting:        '等待中',
    active:         '进行中',
    done:           '已完成',
    paused:         '已暂停',
    in_production:  '生产中',
    completed:      '已完成',
    // Phase 4: Production record statuses
    '待生产': '待生产',
    '生产中': '生产中',
    '已完成': '已完成',
    '未录入': '未录入',
  },

  // Status Colors
  STATUS_COLORS: {
    waiting:        { bg: '#F3F4F6', text: '#6B7280' },
    active:         { bg: '#DBEAFE', text: '#1D4ED8' },
    done:           { bg: '#D1FAE5', text: '#047857' },
    paused:         { bg: '#FEF3C7', text: '#B45309' },
    in_production:  { bg: '#DBEAFE', text: '#1D4ED8' },
    completed:      { bg: '#D1FAE5', text: '#047857' },
    // Phase 4: Production record status colors
    '待生产': { bg: '#F3F4F6', text: '#9CA3AF' },
    '生产中': { bg: '#DBEAFE', text: '#1D4ED8' },
    '已完成': { bg: '#D1FAE5', text: '#047857' },
    '未录入': { bg: '#F3F4F6', text: '#9CA3AF' },
  },

  // Rework Colors
  REWORK_COLORS: ['transparent', '#FFF7ED', '#FFEDD5', '#FED7AA'],

  // Presets
  EXCEPTION_TYPES: [
    '色差', '电镀不良', '划伤', '沙眼', '变形', '其他'
  ],

  EXCEPTION_RESOLUTIONS: [
    '返回电镀', '返回磨板', '重做', '特采', '报废'
  ],

  PAUSE_REASONS: [
    { value: 'waiting_customer',  label: '待客户确认' },
    { value: 'waiting_material',  label: '待物料' },
    { value: 'waiting_schedule',  label: '待排期' },
    { value: 'customer_hold',     label: '客户要求暂停' },
    { value: 'quality_hold',      label: '质量问题待处理' },
    { value: 'other',             label: '其他' },
  ],

  // Texture suggestions (datalist, not enum)
  TEXTURE_SUGGESTIONS: ['无底纹', '太阳纹', '直线纹'],
};
