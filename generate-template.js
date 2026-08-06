// DialFactory V1 · 业务数据采集模板生成器
// 运行：node generate-template.js
// 输出：DialFactory_数据采集模板.xlsx

const ExcelJS = require('exceljs');

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DialFactory';
  wb.created = new Date();

  // ============================================================
  // 通用辅助函数
  // ============================================================

  function headerStyle(fontSize = 12) {
    return {
      font: { bold: true, size: fontSize, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } },
      alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
      border: {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' }
      }
    };
  }

  function exampleStyle() {
    return {
      font: { italic: true, size: 10, color: { argb: 'FF6B7280' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } },
      alignment: { vertical: 'middle', wrapText: true },
      border: {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' }
      }
    };
  }

  function dataStyle() {
    return {
      alignment: { vertical: 'middle', wrapText: true },
      border: {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' }
      }
    };
  }

  function setupSheet(ws, columns, exampleRow, dataStartRow, description) {
    // 写入说明行
    ws.mergeCells(1, 1, 1, columns.length);
    const descCell = ws.getCell('A1');
    descCell.value = description;
    descCell.font = { bold: true, size: 10, color: { argb: 'FF374151' } };
    descCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    descCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    ws.getRow(1).height = 28;

    // 写入表头（第2行）
    const headerRow = ws.getRow(2);
    columns.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.header;
      cell.style = headerStyle();
    });
    headerRow.height = 22;

    // 写入示例数据（第3行）
    const exampleDataRow = ws.getRow(3);
    columns.forEach((col, i) => {
      const cell = exampleDataRow.getCell(i + 1);
      cell.value = exampleRow[i] !== undefined ? exampleRow[i] : '';
      cell.style = exampleStyle();
    });
    exampleDataRow.height = 20;

    // 设置列宽
    columns.forEach((col, i) => {
      ws.getColumn(i + 1).width = col.width || 18;
    });

    // 冻结前2行（说明行 + 表头行）
    ws.views = [{ state: 'frozen', ySplit: 2 }];

    // 为数据区域（第4行起）预设样式
    for (let r = 4; r <= 4 + dataStartRow; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= columns.length; c++) {
        row.getCell(c).style = dataStyle();
        row.getCell(c).alignment = { vertical: 'middle', wrapText: true };
      }
    }

    return ws;
  }

  // ============================================================
  // 数据验证辅助函数
  // ============================================================

  function addListValidation(ws, colLetter, startRow, endRow, list) {
    ws.getColumn(colLetter).eachCell({ includeEmpty: true }, (cell, rowNumber) => {
      if (rowNumber >= startRow && rowNumber <= endRow) {
        cell.dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${list.join(',')}"`],
          showErrorMessage: true,
          errorTitle: '无效输入',
          error: '请从下拉列表中选择'
        };
      }
    });
  }

  function addDateValidation(ws, colLetter, startRow, endRow) {
    ws.getColumn(colLetter).eachCell({ includeEmpty: true }, (cell, rowNumber) => {
      if (rowNumber >= startRow && rowNumber <= endRow) {
        cell.numFmt = 'yyyy-mm-dd';
        cell.dataValidation = {
          type: 'date',
          allowBlank: true,
          formulae: ['2020-01-01', '2030-12-31'],
          showErrorMessage: true,
          errorTitle: '无效日期',
          error: '请输入有效日期（如 2026-08-15）'
        };
      }
    });
  }

  // ============================================================
  // Sheet 1: 部门清单
  // ============================================================
  (() => {
    const ws = wb.addWorksheet('1-部门清单', {
      properties: { tabColor: { argb: 'FF3B82F6' } }
    });
    const cols = [
      { header: '部门名称', width: 14 },
      { header: '顺序号', width: 10 },
      { header: '部门类型', width: 12 },
      { header: '备注', width: 30 }
    ];
    const example = ['制一', 1, '生产', ''];
    setupSheet(ws, cols, example, 12,
      '📋 Sheet 1：部门清单 —— 列出工厂所有生产部门。这是最基础的主数据。');
    // 部门类型下拉
    addListValidation(ws, 'C', 3, 20, ['生产', '检验']);
    // 预填5个部门
    const depts = [
      ['制一', 1, '生产', '冲压成型'],
      ['制二', 2, '生产', '打磨/喷砂/纹理'],
      ['制三', 3, '生产', '电镀'],
      ['制四', 4, '生产', '移印/装字钉/清洁'],
      ['总QC', 5, '检验', '最终质量检验']
    ];
    depts.forEach((d, i) => {
      const row = ws.getRow(4 + i);
      d.forEach((v, j) => { row.getCell(j + 1).value = v; });
    });
  })();

  // ============================================================
  // Sheet 2: 客户清单
  // ============================================================
  (() => {
    const ws = wb.addWorksheet('2-客户清单', {
      properties: { tabColor: { argb: 'FF10B981' } }
    });
    const cols = [
      { header: '客户全称', width: 30 },
      { header: '客户简称', width: 12 },
      { header: '是否活跃', width: 12 },
      { header: '备注', width: 30 }
    ];
    const example = ['深圳时诺钟表有限公司', '时诺', '是', ''];
    setupSheet(ws, cols, example, 25,
      '📋 Sheet 2：客户清单 —— 列出工厂所有客户。用于订单创建时的客户选择。');
    addListValidation(ws, 'C', 3, 30, ['是', '否']);
  })();

  // ============================================================
  // Sheet 3: 工序清单
  // ============================================================
  (() => {
    const ws = wb.addWorksheet('3-工序清单', {
      properties: { tabColor: { argb: 'FFF59E0B' } }
    });
    const cols = [
      { header: '工序编号', width: 12 },
      { header: '工序名称', width: 18 },
      { header: '工序类型', width: 12 },
      { header: '默认执行部门', width: 14 },
      { header: '是否必经', width: 12 },
      { header: '备注', width: 30 }
    ];
    const example = ['P01', '冲压成型', '加工', '制一', '是', ''];
    setupSheet(ws, cols, example, 30,
      '📋 Sheet 3：工序清单 —— 列出工厂所有可执行的工序（能力目录）。编号格式 P01-P99。');
    addListValidation(ws, 'C', 3, 35, ['加工', '检验', '辅助']);
    addListValidation(ws, 'E', 3, 35, ['是', '否']);
    // 预填示例工序
    const processes = [
      ['P01', '冲压成型', '加工', '制一', '是', ''],
      ['P02', 'CD纹加工', '加工', '制二', '否', ''],
      ['P03', '太阳纹加工', '加工', '制二', '否', ''],
      ['P04', '喷砂', '加工', '制二', '否', '重砂/轻砂/中砂'],
      ['P05', '银白电镀', '加工', '制三', '否', ''],
      ['P06', '金色电镀', '加工', '制三', '否', ''],
      ['P07', '移印', '加工', '制四', '否', 'Logo/刻度'],
      ['P08', '装字钉', '加工', '制四', '否', ''],
      ['P09', '清洁', '辅助', '制四', '否', ''],
      ['P10', '总QC检验', '检验', '总QC', '是', '每件必检'],
    ];
    processes.forEach((p, i) => {
      const row = ws.getRow(4 + i);
      p.forEach((v, j) => { row.getCell(j + 1).value = v; });
    });
  })();

  // ============================================================
  // Sheet 4-1: 工艺路线主表
  // ============================================================
  (() => {
    const ws = wb.addWorksheet('4-1-工艺路线主表', {
      properties: { tabColor: { argb: 'FF8B5CF6' } }
    });
    const cols = [
      { header: '路线名称', width: 28 },
      { header: '适用场景', width: 40 },
      { header: '备注', width: 30 }
    ];
    const example = ['太阳纹+银白标准路线', '太阳纹底质、银白电镀的常规订单', ''];
    setupSheet(ws, cols, example, 10,
      '📋 Sheet 4-1：工艺路线主表 —— 列出工厂常用的标准工艺路线。');
    const routes = [
      ['太阳纹+银白标准路线', '太阳纹底质、银白电镀、轻砂的常规订单', '最常用'],
      ['CD纹+金色标准路线', 'CD纹底质、金色电镀的订单', ''],
      ['无底纹+银白路线', '无纹理、银白电镀的简约款', ''],
    ];
    routes.forEach((r, i) => {
      const row = ws.getRow(4 + i);
      r.forEach((v, j) => { row.getCell(j + 1).value = v; });
    });
  })();

  // ============================================================
  // Sheet 4-2: 路线工序明细
  // ============================================================
  (() => {
    const ws = wb.addWorksheet('4-2-路线工序明细', {
      properties: { tabColor: { argb: 'FF8B5CF6' } }
    });
    const cols = [
      { header: '路线名称', width: 28 },
      { header: '顺序号', width: 10 },
      { header: '工序编号', width: 12 },
      { header: '工序名称', width: 18 },
      { header: '备注', width: 30 }
    ];
    const example = ['太阳纹+银白标准路线', 1, 'P01', '冲压成型', ''];
    setupSheet(ws, cols, example, 40,
      '📋 Sheet 4-2：路线工序明细 —— 每条路线包含哪些工序，按顺序排列。路线名称需与 Sheet 4-1 一致。');
    const steps = [
      ['太阳纹+银白标准路线', 1, 'P01', '冲压成型', ''],
      ['太阳纹+银白标准路线', 2, 'P03', '太阳纹加工', ''],
      ['太阳纹+银白标准路线', 3, 'P04', '喷砂', '轻砂'],
      ['太阳纹+银白标准路线', 4, 'P05', '银白电镀', ''],
      ['太阳纹+银白标准路线', 5, 'P07', '移印', ''],
      ['太阳纹+银白标准路线', 6, 'P09', '清洁', ''],
      ['太阳纹+银白标准路线', 7, 'P10', '总QC检验', ''],
      ['', '', '', '', ''],
      ['CD纹+金色标准路线', 1, 'P01', '冲压成型', ''],
      ['CD纹+金色标准路线', 2, 'P02', 'CD纹加工', ''],
      ['CD纹+金色标准路线', 3, 'P06', '金色电镀', ''],
      ['CD纹+金色标准路线', 4, 'P07', '移印', ''],
      ['CD纹+金色标准路线', 5, 'P09', '清洁', ''],
      ['CD纹+金色标准路线', 6, 'P10', '总QC检验', ''],
    ];
    steps.forEach((s, i) => {
      const row = ws.getRow(4 + i);
      s.forEach((v, j) => { row.getCell(j + 1).value = v; });
    });
  })();

  // ============================================================
  // Sheet 5: 历史订单
  // ============================================================
  (() => {
    const ws = wb.addWorksheet('5-历史订单', {
      properties: { tabColor: { argb: 'FFEF4444' } }
    });
    const cols = [
      { header: '订单编号', width: 18 },
      { header: '客户简称', width: 12 },
      { header: '订单数量', width: 12 },
      { header: '交期', width: 14 },
      { header: '底质纹理', width: 14 },
      { header: '电镀颜色', width: 14 },
      { header: '喷砂类型', width: 12 },
      { header: '路线名称', width: 26 },
      { header: '实际完成日期', width: 16 },
      { header: '备注', width: 30 }
    ];
    const example = ['SN-2026-0088', '时诺', 500, '2026-08-20', '太阳纹', '银白60s', '轻砂', '太阳纹+银白标准路线', '2026-08-18', ''];
    setupSheet(ws, cols, example, 25,
      '📋 Sheet 5：历史订单 —— 录入最近完成的真实订单。目标：10张订单。');
    addDateValidation(ws, 'D', 3, 30);
    addDateValidation(ws, 'I', 3, 30);
    addListValidation(ws, 'E', 3, 30, ['无底纹', '太阳纹', 'CD纹']);
    addListValidation(ws, 'G', 3, 30, ['-', '重砂', '轻砂', '中砂']);
  })();

  // ============================================================
  // Sheet 6: 工序执行记录
  // ============================================================
  (() => {
    const ws = wb.addWorksheet('6-工序执行记录', {
      properties: { tabColor: { argb: 'FF3B82F6' } }
    });
    const cols = [
      { header: '订单编号', width: 18 },
      { header: '顺序号', width: 10 },
      { header: '工序名称', width: 18 },
      { header: '执行部门', width: 12 },
      { header: '状态', width: 12 },
      { header: '返工次数', width: 10 },
      { header: '产出数量', width: 12 },
      { header: '开始日期(约)', width: 16 },
      { header: '完成日期(约)', width: 16 },
      { header: '备注', width: 30 }
    ];
    const example = ['SN-2026-0088', 1, '冲压成型', '制一', '已完成', 0, '', '2026-08-01', '2026-08-02', ''];
    setupSheet(ws, cols, example, 80,
      '📋 Sheet 6：工序执行记录 ⭐ 最关键 —— 选2-3张已完成的订单，记录完整工序路径。返工时：相同订单+相同顺序号+返工次数递增。');
    addListValidation(ws, 'E', 3, 100, ['等待中', '进行中', '已完成', '暂停']);
    addListValidation(ws, 'F', 4, 100, ['0', '1', '2', '3']);
    addDateValidation(ws, 'H', 3, 100);
    addDateValidation(ws, 'I', 3, 100);

    // 预填一条完整订单的示例
    const nodes = [
      ['SN-2026-0088', 1, '冲压成型', '制一', '已完成', 0, '', '2026-08-01', '2026-08-02', ''],
      ['SN-2026-0088', 2, '太阳纹加工', '制二', '已完成', 0, '', '2026-08-03', '2026-08-05', ''],
      ['SN-2026-0088', 3, '喷砂', '制二', '已完成', 0, '', '2026-08-05', '2026-08-06', '轻砂'],
      ['SN-2026-0088', 4, '银白电镀', '制三', '已完成', 0, '', '2026-08-07', '2026-08-10', '第一批'],
      ['SN-2026-0088', 4, '银白电镀', '制三', '已完成', 1, '', '2026-08-11', '2026-08-13', '返工：色差重镀'],
      ['SN-2026-0088', 5, '移印', '制四', '已完成', 0, '', '2026-08-14', '2026-08-15', ''],
      ['SN-2026-0088', 6, '清洁', '制四', '已完成', 0, '', '2026-08-15', '2026-08-16', ''],
      ['SN-2026-0088', 7, '总QC检验', '总QC', '已完成', 0, 470, '2026-08-16', '2026-08-17', '合格470/报废30'],
    ];
    nodes.forEach((n, i) => {
      const row = ws.getRow(4 + i);
      n.forEach((v, j) => { row.getCell(j + 1).value = v; });
    });
  })();

  // ============================================================
  // Sheet 7: 质量事件
  // ============================================================
  (() => {
    const ws = wb.addWorksheet('7-质量事件', {
      properties: { tabColor: { argb: 'FFDC2626' } }
    });
    const cols = [
      { header: '订单编号', width: 18 },
      { header: '发生在哪道工序', width: 18 },
      { header: '缺陷类型', width: 14 },
      { header: '影响数量', width: 12 },
      { header: '处理方式', width: 14 },
      { header: '简要描述', width: 40 }
    ];
    const example = ['SN-2026-0088', '总QC检验', '色差', 30, '报废', '银白色偏黄，与客户签样不一致'];
    setupSheet(ws, cols, example, 30,
      '📋 Sheet 7：质量事件 —— 记录生产过程中真实发生的质量问题。目标：≥5条。');
    addListValidation(ws, 'C', 3, 35, ['色差', '电镀不良', '划伤', '沙眼', '变形', '其他']);
    addListValidation(ws, 'E', 3, 35, ['返回电镀', '返回磨板', '重做', '特采', '报废']);
    // 预填示例
    const events = [
      ['SN-2026-0088', '总QC检验', '色差', 30, '报废', '银白色偏黄，与客户签样不一致'],
      ['SN-2026-0088', '银白电镀', '电镀不良', 50, '返回电镀', '镀层不均匀，局部发雾'],
      ['', '', '', '', '', ''],
    ];
    events.forEach((e, i) => {
      const row = ws.getRow(4 + i);
      e.forEach((v, j) => { row.getCell(j + 1).value = v; });
    });
  })();

  // ============================================================
  // Sheet 8: 外协供应商（可选）
  // ============================================================
  (() => {
    const ws = wb.addWorksheet('8-外协供应商', {
      properties: { tabColor: { argb: 'FF9CA3AF' } }
    });
    const cols = [
      { header: '供应商名称', width: 24 },
      { header: '承接工序', width: 18 },
      { header: '通常数量/次', width: 14 },
      { header: '通常周期(天)', width: 14 },
      { header: '联系方式', width: 20 },
      { header: '备注', width: 30 }
    ];
    const example = ['XX喷砂厂', '喷砂', 500, 5, '张工 138xxxx', '合作3年，质量稳定'];
    setupSheet(ws, cols, example, 20,
      '📋 Sheet 8：外协供应商（可选） —— 为 V1.5 做准备。当前可不填。');
  })();

  // ============================================================
  // Sheet 9: 现场确认问题清单
  // ============================================================
  (() => {
    const ws = wb.addWorksheet('9-现场确认问题', {
      properties: { tabColor: { argb: 'FFF59E0B' } }
    });
    const cols = [
      { header: '编号', width: 8 },
      { header: '分类', width: 16 },
      { header: '问题', width: 50 },
      { header: '假设答案', width: 30 },
      { header: '工厂答案', width: 30 },
      { header: '影响说明', width: 40 }
    ];

    // 说明行
    ws.mergeCells(1, 1, 1, cols.length);
    const descCell = ws.getCell('A1');
    descCell.value = '📋 Sheet 9：现场确认问题清单 —— 逐条向工厂跟单员/部门负责人确认。答案直接影响业务模型正确性。黄色行 = 高优先级。';
    descCell.font = { bold: true, size: 10, color: { argb: 'FF374151' } };
    descCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    descCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    ws.getRow(1).height = 30;

    // 表头
    const headerRow = ws.getRow(2);
    cols.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.header;
      cell.style = headerStyle();
    });
    headerRow.height = 22;

    // 列宽
    cols.forEach((col, i) => {
      ws.getColumn(i + 1).width = col.width;
    });

    // 冻结
    ws.views = [{ state: 'frozen', ySplit: 2 }];

    // 高优先级样式
    function highPriorityStyle() {
      return {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } },
        border: {
          top: { style: 'thin' }, bottom: { style: 'thin' },
          left: { style: 'thin' }, right: { style: 'thin' }
        },
        alignment: { vertical: 'middle', wrapText: true }
      };
    }

    function normalStyle() {
      return {
        border: {
          top: { style: 'thin' }, bottom: { style: 'thin' },
          left: { style: 'thin' }, right: { style: 'thin' }
        },
        alignment: { vertical: 'middle', wrapText: true }
      };
    }

    function priorityRow(ws, rowNum, id, category, question, assumption, impact) {
      const row = ws.getRow(rowNum);
      const values = [id, category, question, assumption, '', impact];
      values.forEach((v, i) => { row.getCell(i + 1).value = v; });
      row.eachCell(cell => { cell.style = highPriorityStyle(); });
      row.height = 36;
    }

    function normalRow(ws, rowNum, id, category, question, assumption, impact) {
      const row = ws.getRow(rowNum);
      const values = [id, category, question, assumption, '', impact];
      values.forEach((v, i) => { row.getCell(i + 1).value = v; });
      row.eachCell(cell => { cell.style = normalStyle(); });
      row.height = 30;
    }

    let r = 3; // 从第3行开始写问题

    // === 第一次确认（30分钟）：订单/路线/质量 —— 决定 V1 能不能做 ===
    ws.mergeCells(r, 1, r, cols.length);
    const section1 = ws.getCell(`A${r}`);
    section1.value = '═══ 第一次确认（30分钟）：订单、路线、质量 —— 决定 V1 能不能做 ═══';
    section1.font = { bold: true, size: 11, color: { argb: 'FF1F2937' } };
    section1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    section1.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(r).height = 26;
    r++;

    // 高优先级的核心问题
    const highPriorityQuestions = [
      ['Q1.1', '订单', '一张订单是否只有一种产品规格？（如：500个是否会出现300个太阳纹+200个CD纹）', '一张订单只有一种规格', '如果否 → 需引入批次概念'],
      ['Q1.2', '订单', '一张订单能否分批生产？（500件订单，是否300件先走、200件后走）', '整批流转，不分批', '如果可分 → 需引入批次概念，架构巨大变化'],
      ['Q4.2', '返工', '返工时，是重做同一道工序，还是退回更早的工序？场景A（退回前面）vs 场景B（重做当前）各自频率？', '场景B（同工序重做）覆盖90%', '如果场景A高频 → V1返工模型不完整'],
      ['Q2.1', '路线', '当前实际有几条常用工艺路线？每条包含哪些工序？', '3-5条常用路线', '决定路线数据量级'],
      ['Q3.1', '质量', '实际生产中常见的缺陷类型有哪些？预设列表是否完整？', '色差/电镀不良/划伤/沙眼/变形 基本覆盖', '决定异常类型预设'],
      ['Q7.1', '数据采集', '每道工序的投入/产出数量是否有人记录？跟单员能否获取这些数字？', '仅总QC有可靠数量记录', '决定数量字段范围'],
    ];

    highPriorityQuestions.forEach(([id, cat, q, a, impact]) => {
      priorityRow(ws, r, id, cat, q, a, impact);
      r++;
    });

    // 普通优先级
    const normalQuestions = [
      ['Q1.3', '订单', '订单编号的格式是否有规律？是工厂自编还是客户给的单号？', '工厂自编，有规律', '影响编号生成逻辑'],
      ['Q1.4', '订单', '交期是谁确定的？客户指定还是工厂推算？', '客户指定', '如果是工厂推算 → 需要排产逻辑'],
      ['Q1.5', '订单', '订单创建后，产品规格（纹理/颜色/喷砂）是否可能变更？', '几乎不变更', '如果会变 → 需要变更记录'],
      ['Q2.2', '路线', '路线创建后是否固定不变？还是经常调整？', '基本不变，偶尔微调', '影响版本管理设计'],
      ['Q2.3', '路线', '订单创建后，是否可以临时增加或跳过某道工序？', '偶尔需要增加', '决定执行记录是否可动态编辑'],
      ['Q2.4', '路线', '电镀颜色是否作为独立工序，还是同一工序的参数？', '同一工序，颜色是订单参数', '影响工序表粒度'],
      ['Q3.2', '质量', '实际处理方式有哪些？预设列表是否完整？', '5种方式基本覆盖', '决定处理方式预设'],
      ['Q3.3', '质量', 'QC发生在哪些工序？只有总QC一个检验点，还是每个部门都有？', '至少总QC有检验', '决定"产出数量必填"节点分布'],
      ['Q3.4', '质量', '异常发现后是否需要触发审批或通知？', 'V1不需要审批流', '如果需要 → 系统不能只是记录工具'],
      ['Q4.1', '返工', '返工通常发生在哪些工序？哪道工序返工频率最高？', '电镀返工最常见', '验证repeat_node是否覆盖主要场景'],
      ['Q4.3', '返工', '同一工序最多返工几次？超过几次会放弃/报废？', '一般1-2次，超过3次报废', '影响返工预警逻辑'],
      ['Q4.4', '返工', '返工批次的产出数量如何记录？', 'V1只要求总QC记录最终数量', '影响数量汇总逻辑'],
    ];

    normalQuestions.forEach(([id, cat, q, a, impact]) => {
      normalRow(ws, r, id, cat, q, a, impact);
      r++;
    });

    // === 第二次确认（30分钟）：外协/移交/数据采集/人员 —— 决定 V1 做多大 ===
    r++;
    ws.mergeCells(r, 1, r, cols.length);
    const section2 = ws.getCell(`A${r}`);
    section2.value = '═══ 第二次确认（30分钟）：外协、移交、数据采集、人员 —— 决定 V1 做多大 ═══';
    section2.font = { bold: true, size: 11, color: { argb: 'FF1F2937' } };
    section2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    section2.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(r).height = 26;
    r++;

    const round2Questions = [
      ['Q5.1', '外协', '外协供应商目前如何管理？口头/微信还是正式流程？', '口头/电话/微信管理为主', '决定外协模块价值'],
      ['Q5.2', '外协', '外协通常涉及哪些工序？', '喷砂和部分特殊电镀', '决定哪些节点可能需要外协标记'],
      ['Q5.3', '外协', '外协发出后，跟单员如何追踪进度？', '跟单员主动催', '决定是否需要催办提醒'],
      ['Q6.1', '移交', '部门之间是否有正式交接流程（点数→签字→确认）？', '通常没有，直接流转', '决定V1是否需要handoffs'],
      ['Q6.2', '移交', '下游部门发现上游质量问题，如何处理？记录在本环节还是退回上游？', '记录在发现位置', '影响异常归因逻辑'],
      ['Q7.2', '数据采集', '跟单员的操作场景？现场平板单手操作 vs 办公室录入？', '现场操作（平板、单手、走动）', '决定交互复杂度'],
      ['Q7.3', '数据采集', '车间网络情况？WiFi覆盖？每天断线多久？', 'WiFi覆盖，偶尔断线<10分钟/天', '决定是否需要离线方案'],
      ['Q7.4', '数据采集', '每道工序通常需要多长时间？（制一？制二？电镀？移印？总QC？）', '需逐工序确认', '决定卡顿预警阈值'],
      ['Q8.1', '人员', '有多少人会日常操作系统？', 'V1期间1-2个跟单员', '决定是否需要多用户'],
      ['Q8.2', '人员', '不同角色是否需要看到不同的数据？', 'V1不需要区分', '决定是否需要权限控制'],
    ];

    round2Questions.forEach(([id, cat, q, a, impact]) => {
      normalRow(ws, r, id, cat, q, a, impact);
      r++;
    });

    // 汇总行
    r++;
    ws.mergeCells(r, 1, r, cols.length);
    const summary = ws.getCell(`A${r}`);
    summary.value = '📝 全部26个问题确认完毕后，与 Business Model V1 对照。任何矛盾之处 = 模型需要修正。黄色高亮行 = 否决级问题（答错可能导致架构推倒重来）。';
    summary.font = { bold: true, size: 10, color: { argb: 'FFDC2626' } };
    summary.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    ws.getRow(r).height = 28;
  })();

  // ============================================================
  // 保存
  // ============================================================
  const outPath = 'c:/Users/10515/Desktop/DialFactory/DialFactory_数据采集模板.xlsx';
  await wb.xlsx.writeFile(outPath);
  console.log('✅ 模板已生成：' + outPath);

  // 输出 Sheet 明细
  console.log('\n📊 文件结构：');
  wb.worksheets.forEach((ws, i) => {
    const rowCount = ws.rowCount;
    const sheetDesc = ws.getCell('A1').value || '';
    const desc = typeof sheetDesc === 'string' ? sheetDesc.substring(0, 60) : '';
    console.log(`  ${i + 1}. [${ws.name}] — ${rowCount} 行 — ${desc}`);
  });
}

main().catch(err => { console.error(err); process.exit(1); });
