// DialFactory · 项目汇报PPT生成器
// 面向工厂管理层，不展示技术细节，突出业务价值和实施路线

const PptxGenJS = require('pptxgenjs');

async function main() {
  const ppt = new PptxGenJS();
  ppt.defineLayout({ name: 'CUSTOM', width: 13.333, height: 7.5 });
  ppt.layout = 'CUSTOM';

  // ============================================================
  // 主题配置
  // ============================================================
  const C = {
    navy:    '1B2A4A',
    blue:    '2563EB',
    lightBlue: 'DBEAFE',
    green:   '059669',
    lightGreen: 'D1FAE5',
    orange:  'D97706',
    lightOrange: 'FEF3C7',
    red:     'DC2626',
    lightRed: 'FEE2E2',
    gray:    '6B7280',
    lightGray: 'F3F4F6',
    white:   'FFFFFF',
    black:   '1F2937',
    purple:  '7C3AED',
  };

  // Helper: add slide number
  let slideNum = 0;
  const slideBg = { color: C.white };

  function addSlideTitle(s, title) {
    s.addShape(ppt.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.06, fill: { color: C.blue } });
    s.addText(title, {
      x: 0.8, y: 0.4, w: 11.5, h: 0.7,
      fontSize: 22, fontFace: 'Microsoft YaHei', bold: true, color: C.navy,
    });
    s.addShape(ppt.ShapeType.rect, { x: 0.8, y: 1.15, w: 11.7, h: 0.02, fill: { color: 'E5E7EB' } });
  }

  // ============================================================
  // Slide 1: 封面
  // ============================================================
  {
    const s = ppt.addSlide();
    s.background = { color: C.navy };

    // 顶部装饰线
    s.addShape(ppt.ShapeType.rect, { x: 1.5, y: 1.0, w: 2.0, h: 0.06, fill: { color: C.green } });

    s.addText('DialFactory', {
      x: 1.5, y: 1.4, w: 8, h: 1.2,
      fontSize: 48, fontFace: 'Microsoft YaHei', bold: true, color: C.white,
    });
    s.addText('表盘工厂 · 生产管理数字化系统', {
      x: 1.5, y: 2.6, w: 8, h: 0.7,
      fontSize: 22, fontFace: 'Microsoft YaHei', color: '9CA3AF',
    });

    // 分隔线
    s.addShape(ppt.ShapeType.rect, { x: 1.5, y: 3.6, w: 10.3, h: 0.02, fill: { color: '374151' } });

    s.addText('项目方案总纲  |  业务建模阶段', {
      x: 1.5, y: 4.0, w: 8, h: 0.5,
      fontSize: 14, fontFace: 'Microsoft YaHei', color: '9CA3AF',
    });
    s.addText('2026年8月', {
      x: 1.5, y: 4.5, w: 4, h: 0.4,
      fontSize: 12, fontFace: 'Microsoft YaHei', color: '6B7280',
    });

    // 右下角装饰
    s.addShape(ppt.ShapeType.rect, { x: 11.5, y: 6.8, w: 1.5, h: 0.06, fill: { color: C.green } });
  }

  // ============================================================
  // Slide 2: 现状与痛点
  // ============================================================
  {
    const s = ppt.addSlide();
    s.background = slideBg;
    addSlideTitle(s, '工厂生产管理 · 现状与挑战');

    // 左侧：现状
    s.addShape(ppt.ShapeType.roundRect, {
      x: 0.8, y: 2.2, w: 5.5, h: 4.2, fill: { color: C.lightGray }, rectRadius: 0.15
    });
    s.addText('当前管理方式', {
      x: 1.2, y: 2.4, w: 5, h: 0.5,
      fontSize: 16, fontFace: 'Microsoft YaHei', bold: true, color: C.black,
    });

    const currentItems = [
      ['📋', '人工跟进', '跟单员靠记忆和走动掌握进度'],
      ['💬', '微信沟通', '异常信息分散在聊天记录中'],
      ['📝', '纸质记录', '无统一格式，难以汇总分析'],
      ['🧠', '经验管理', '生产知识在个人脑中，无法传承'],
    ];
    currentItems.forEach(([icon, title, desc], i) => {
      const y = 3.1 + i * 0.8;
      s.addText(icon, { x: 1.3, y, w: 0.5, h: 0.6, fontSize: 20 });
      s.addText(title, { x: 1.9, y, w: 1.5, h: 0.35, fontSize: 13, fontFace: 'Microsoft YaHei', bold: true, color: C.black });
      s.addText(desc, { x: 1.9, y: y + 0.32, w: 4, h: 0.3, fontSize: 11, fontFace: 'Microsoft YaHei', color: C.gray });
    });

    // 右侧：痛点
    s.addShape(ppt.ShapeType.roundRect, {
      x: 7.0, y: 2.2, w: 5.5, h: 4.2, fill: { color: C.lightRed }, rectRadius: 0.15
    });
    s.addText('导致的问题', {
      x: 7.4, y: 2.4, w: 5, h: 0.5,
      fontSize: 16, fontFace: 'Microsoft YaHei', bold: true, color: C.red,
    });

    const painItems = [
      '❌ 无法实时知道订单在哪道工序',
      '❌ 延期原因难以快速定位',
      '❌ 质量问题无法系统追踪',
      '❌ 历史数据无法沉淀复用',
      '❌ 管理高度依赖个人经验',
    ];
    painItems.forEach((item, i) => {
      s.addText(item, {
        x: 7.5, y: 3.1 + i * 0.65, w: 4.8, h: 0.5,
        fontSize: 12, fontFace: 'Microsoft YaHei', color: C.black,
      });
    });
  }

  // ============================================================
  // Slide 3: 项目目标
  // ============================================================
  {
    const s = ppt.addSlide();
    s.background = slideBg;
    addSlideTitle(s, '系统目标：回答五个核心问题');

    const goals = [
      { q: 'Q1', title: '订单现在在哪？', desc: '流程图实时定位订单所属工序和部门', color: C.blue },
      { q: 'Q2', title: '卡在哪个工序？', desc: '超时自动标红，一眼识别延期风险', color: C.red },
      { q: 'Q3', title: '为什么停？', desc: '异常事件记录在对应工序上，原因可追溯', color: C.orange },
      { q: 'Q4', title: '谁负责？', desc: '操作记录+时间戳，责任归属清晰', color: C.purple },
      { q: 'Q5', title: '历史发生过什么？', desc: '完整生产轨迹可回溯，数据可沉淀', color: C.green },
    ];

    goals.forEach((g, i) => {
      const x = 0.8 + i * 2.45;
      const y = 2.2;

      // 卡片背景
      s.addShape(ppt.ShapeType.roundRect, {
        x, y, w: 2.2, h: 4.2, fill: { color: C.white },
        shadow: { type: 'outer', blur: 6, offset: 2, color: 'D1D5DB', opacity: 0.5 },
        rectRadius: 0.12,
        line: { color: g.color, width: 2 }
      });

      // 编号圆
      s.addShape(ppt.ShapeType.ellipse, {
        x: x + 0.7, y: y + 0.3, w: 0.8, h: 0.8,
        fill: { color: g.color }
      });
      s.addText(g.q, {
        x: x + 0.7, y: y + 0.35, w: 0.8, h: 0.7,
        fontSize: 20, fontFace: 'Microsoft YaHei', bold: true, color: C.white, align: 'center', valign: 'middle'
      });

      s.addText(g.title, {
        x: x + 0.15, y: y + 1.4, w: 1.9, h: 0.5,
        fontSize: 14, fontFace: 'Microsoft YaHei', bold: true, color: C.black, align: 'center'
      });
      s.addText(g.desc, {
        x: x + 0.15, y: y + 2.1, w: 1.9, h: 1.2,
        fontSize: 10.5, fontFace: 'Microsoft YaHei', color: C.gray, align: 'center', valign: 'top'
      });

      // 底部色条
      s.addShape(ppt.ShapeType.rect, {
        x: x + 0.3, y: y + 3.6, w: 1.6, h: 0.05,
        fill: { color: g.color }
      });
    });
  }

  // ============================================================
  // Slide 4: 当前阶段定位
  // ============================================================
  {
    const s = ppt.addSlide();
    s.background = slideBg;
    addSlideTitle(s, '当前阶段：业务建模');

    // 阶段指示器
    const phases = [
      { name: '业务\n建模', status: 'current', color: C.green },
      { name: '数据\n验证', status: 'next', color: C.blue },
      { name: '原型\n设计', status: 'future', color: C.gray },
      { name: '开发\n测试', status: 'future', color: C.gray },
      { name: '上线\n使用', status: 'future', color: C.gray },
    ];

    phases.forEach((p, i) => {
      const x = 0.8 + i * 2.45;
      const isActive = p.status === 'current';
      const isNext = p.status === 'next';

      s.addShape(ppt.ShapeType.roundRect, {
        x, y: 2.2, w: 2.2, h: 1.8,
        fill: { color: isActive ? C.green : isNext ? C.blue : C.lightGray },
        rectRadius: 0.12,
      });
      s.addText(p.name, {
        x, y: 2.4, w: 2.2, h: 1.4,
        fontSize: isActive ? 16 : 14, fontFace: 'Microsoft YaHei',
        bold: isActive || isNext, color: isActive || isNext ? C.white : C.gray,
        align: 'center', valign: 'middle',
      });
      if (isActive) {
        s.addText('◀ 当前', {
          x, y: 4.15, w: 2.2, h: 0.4,
          fontSize: 10, fontFace: 'Microsoft YaHei', bold: true, color: C.green, align: 'center',
        });
      }
    });

    // 说明
    s.addShape(ppt.ShapeType.roundRect, {
      x: 0.8, y: 5.0, w: 11.7, h: 1.5, fill: { color: C.lightGreen }, rectRadius: 0.1
    });
    s.addText([
      { text: '当前重点：', options: { bold: true, fontSize: 13, color: C.green } },
      { text: '建立准确描述工厂业务的模型，用真实数据验证，再进入系统设计。\n不写代码，不建数据库，不设计界面。', options: { fontSize: 12, color: C.black } },
    ], {
      x: 1.2, y: 5.15, w: 10.8, h: 1.2, fontFace: 'Microsoft YaHei',
    });
  }

  // ============================================================
  // Slide 5: 已完成工作
  // ============================================================
  {
    const s = ppt.addSlide();
    s.background = slideBg;
    addSlideTitle(s, '已完成：业务建模四件套');

    const items = [
      { icon: '🏗️', title: 'Business Model V1', desc: '识别 14 个业务实体，7 个核心实体\n建立 ER 关系模型，定义数据字典', color: C.blue },
      { icon: '📊', title: '数据录入模板', desc: '8 个 Excel Sheet，含示例数据\n预填部门/工序/路线/订单', color: C.green },
      { icon: '❓', title: '现场确认问题清单', desc: '26 个问题，9 大分类\n区分否决级问题与范围级问题', color: C.orange },
      { icon: '📐', title: 'V1 Scope 定义', desc: '明确 V1 / V1.5 / V2 版本边界\n8 张表，9 项功能，四态模型', color: C.purple },
    ];

    items.forEach((item, i) => {
      const x = 0.5 + i * 3.15;
      s.addShape(ppt.ShapeType.roundRect, {
        x, y: 2.2, w: 2.9, h: 3.5, fill: { color: C.white },
        shadow: { type: 'outer', blur: 4, offset: 1, color: 'D1D5DB', opacity: 0.4 },
        rectRadius: 0.1,
      });
      s.addText(item.icon, { x, y: 2.5, w: 2.9, h: 0.6, fontSize: 28, align: 'center' });
      s.addText(item.title, {
        x, y: 3.1, w: 2.9, h: 0.45,
        fontSize: 13, fontFace: 'Microsoft YaHei', bold: true, color: item.color, align: 'center',
      });
      s.addText(item.desc, {
        x: x + 0.2, y: 3.7, w: 2.5, h: 1.5,
        fontSize: 10, fontFace: 'Microsoft YaHei', color: C.gray, align: 'center', valign: 'top',
      });
    });

    s.addText('📁 产出文件：AI_CONTEXT/01 ~ 12 共 12 份设计文档', {
      x: 0.8, y: 6.2, w: 11, h: 0.4,
      fontSize: 11, fontFace: 'Microsoft YaHei', color: C.gray,
    });
  }

  // ============================================================
  // Slide 6: 核心业务实体
  // ============================================================
  {
    const s = ppt.addSlide();
    s.background = slideBg;
    addSlideTitle(s, '核心业务实体');

    const entities = [
      { name: '客户', sub: '订单来源', color: C.blue },
      { name: '订单', sub: '生产活动起点', color: C.navy },
      { name: '工序', sub: '工厂能力目录', color: C.green },
      { name: '工艺路线', sub: '标准生产流程', color: C.purple },
      { name: '部门', sub: '组织单元', color: C.orange },
      { name: '工序执行记录', sub: '⭐ 核心追踪单元', color: C.red },
      { name: '质量事件', sub: '异常记录', color: C.red },
    ];

    entities.forEach((e, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = 0.8 + col * 3.1;
      const y = 2.0 + row * 2.3;

      s.addShape(ppt.ShapeType.roundRect, {
        x, y, w: 2.8, h: 1.6, fill: { color: C.white },
        line: { color: e.color, width: 2 }, rectRadius: 0.1,
        shadow: { type: 'outer', blur: 3, offset: 1, color: 'D1D5DB', opacity: 0.3 },
      });
      s.addText(e.name, {
        x, y: y + 0.2, w: 2.8, h: 0.55,
        fontSize: 16, fontFace: 'Microsoft YaHei', bold: true, color: e.color, align: 'center',
      });
      s.addText(e.sub, {
        x, y: y + 0.85, w: 2.8, h: 0.45,
        fontSize: 11, fontFace: 'Microsoft YaHei', color: C.gray, align: 'center',
      });
    });
  }

  // ============================================================
  // Slide 7: 业务关系全景
  // ============================================================
  {
    const s = ppt.addSlide();
    s.background = slideBg;
    addSlideTitle(s, '业务关系全景');

    // 用圆角矩形+箭头模拟关系图
    const boxW = 2.4, boxH = 0.7;
    const center = 6.65;

    const drawBox = (x, y, text, color) => {
      s.addShape(ppt.ShapeType.roundRect, {
        x: x - boxW/2, y, w: boxW, h: boxH,
        fill: { color }, rectRadius: 0.08,
        shadow: { type: 'outer', blur: 2, offset: 1, color: 'D1D5DB', opacity: 0.3 },
      });
      s.addText(text, {
        x: x - boxW/2, y, w: boxW, h: boxH,
        fontSize: 13, fontFace: 'Microsoft YaHei', bold: true, color: C.white, align: 'center', valign: 'middle',
      });
    };

    const drawArrow = (y) => {
      s.addText('▼', { x: center - 0.15, y: y, w: 0.3, h: 0.3, fontSize: 10, color: C.gray, align: 'center', fontFace: 'Microsoft YaHei' });
    };

    drawBox(center, 1.8, '客户', C.navy);
    drawArrow(2.5);
    drawBox(center, 2.8, '订单', C.blue);
    drawArrow(3.5);
    drawBox(center, 3.8, '工艺路线', C.purple);
    drawArrow(4.5);

    // 两个并列
    drawBox(center - 1.8, 4.8, '工序执行记录', C.red);
    drawBox(center + 1.8, 4.8, '部门', C.orange);
    drawArrow(5.5);
    drawBox(center, 5.8, '质量事件', C.red);

    // 右侧说明
    s.addText('工序执行记录 = 核心追踪单元\n回答"订单现在在哪"', {
      x: 8.5, y: 4.5, w: 4, h: 0.9,
      fontSize: 10, fontFace: 'Microsoft YaHei', color: C.red, align: 'center',
    });
  }

  // ============================================================
  // Slide 8: 订单创建流程
  // ============================================================
  {
    const s = ppt.addSlide();
    s.background = slideBg;
    addSlideTitle(s, '流程一：订单创建');

    const steps = [
      { title: '客户下单', desc: '客户发来采购单\n数量·交期·规格', color: C.navy },
      { title: '跟单员录入', desc: '填订单号·选客户\n选路线·填数量·交期', color: C.blue },
      { title: '选择工艺路线', desc: '从3-5条标准路线中选\n如"太阳纹+银白"', color: C.purple },
      { title: '自动生成工序', desc: '系统按路线展开为\n工序执行记录列表', color: C.green },
      { title: '进入生产', desc: '第一条工序自动激活\n订单状态 = 生产中', color: C.orange },
    ];

    steps.forEach((step, i) => {
      const x = 0.35 + i * 2.55;
      // 卡片
      s.addShape(ppt.ShapeType.roundRect, {
        x, y: 2.0, w: 2.3, h: 3.5, fill: { color: C.white },
        line: { color: step.color, width: 2 }, rectRadius: 0.1,
      });
      // 编号
      s.addShape(ppt.ShapeType.ellipse, {
        x: x + 0.75, y: 2.2, w: 0.8, h: 0.8, fill: { color: step.color }
      });
      s.addText(`${i + 1}`, {
        x: x + 0.75, y: 2.25, w: 0.8, h: 0.7,
        fontSize: 18, fontFace: 'Microsoft YaHei', bold: true, color: C.white, align: 'center', valign: 'middle',
      });
      s.addText(step.title, {
        x, y: 3.2, w: 2.3, h: 0.5,
        fontSize: 14, fontFace: 'Microsoft YaHei', bold: true, color: C.black, align: 'center',
      });
      s.addText(step.desc, {
        x: x + 0.1, y: 3.8, w: 2.1, h: 1.3,
        fontSize: 10.5, fontFace: 'Microsoft YaHei', color: C.gray, align: 'center', valign: 'top',
      });

      // 箭头
      if (i < steps.length - 1) {
        s.addText('→', {
          x: x + 2.3, y: 3.2, w: 0.3, h: 0.5,
          fontSize: 18, fontFace: 'Microsoft YaHei', bold: true, color: C.gray, align: 'center',
        });
      }
    });

    // 底部指标
    s.addShape(ppt.ShapeType.roundRect, {
      x: 0.8, y: 5.9, w: 11.7, h: 0.9, fill: { color: C.lightBlue }, rectRadius: 0.08
    });
    s.addText('⏱ 目标操作时间：≤ 60 秒（选客户 → 选路线 → 填数量 → 填交期 → 创建）', {
      x: 1.2, y: 6.0, w: 11, h: 0.6,
      fontSize: 13, fontFace: 'Microsoft YaHei', bold: true, color: C.blue,
    });
  }

  // ============================================================
  // Slide 9: 生产推进流程
  // ============================================================
  {
    const s = ppt.addSlide();
    s.background = slideBg;
    addSlideTitle(s, '流程二：生产推进（日常最高频操作）');

    // 主流程
    s.addShape(ppt.ShapeType.roundRect, {
      x: 2.5, y: 2.0, w: 8.3, h: 1.8, fill: { color: C.lightBlue }, rectRadius: 0.1
    });
    s.addText('跟单员走到车间 → 看到工序完成 → 点"完成"按钮 → 下一工序自动激活', {
      x: 2.8, y: 2.2, w: 7.8, h: 0.5,
      fontSize: 14, fontFace: 'Microsoft YaHei', bold: true, color: C.blue,
    });
    s.addText('⏱ 目标操作时间：≤ 3 秒（点一次按钮）', {
      x: 2.8, y: 2.7, w: 7.8, h: 0.4,
      fontSize: 12, fontFace: 'Microsoft YaHei', color: C.blue,
    });

    // 状态流转图
    const states = [
      { name: '等待中', color: C.gray, icon: '⏸' },
      { name: '进行中', color: C.blue, icon: '▶' },
      { name: '已完成', color: C.green, icon: '✓' },
      { name: '暂停', color: C.orange, icon: '⏯' },
    ];

    states.forEach((st, i) => {
      const x = 1.2 + i * 3.1;
      s.addShape(ppt.ShapeType.roundRect, {
        x, y: 4.3, w: 2.6, h: 1.6, fill: { color: st.color }, rectRadius: 0.1
      });
      s.addText(st.icon, {
        x, y: 4.4, w: 2.6, h: 0.6, fontSize: 24, align: 'center',
      });
      s.addText(st.name, {
        x, y: 5.1, w: 2.6, h: 0.5,
        fontSize: 14, fontFace: 'Microsoft YaHei', bold: true, color: C.white, align: 'center',
      });

      if (i < states.length - 1) {
        s.addText('→', {
          x: x + 2.6, y: 4.8, w: 0.5, h: 0.5,
          fontSize: 18, fontFace: 'Microsoft YaHei', bold: true, color: C.gray, align: 'center',
        });
      }
    });
  }

  // ============================================================
  // Slide 10: 异常与返工流程
  // ============================================================
  {
    const s = ppt.addSlide();
    s.background = slideBg;
    addSlideTitle(s, '流程三：异常记录 & 返工');

    // 左：异常
    s.addShape(ppt.ShapeType.roundRect, {
      x: 0.5, y: 2.0, w: 5.8, h: 4.5, fill: { color: C.white },
      line: { color: C.red, width: 2 }, rectRadius: 0.1,
    });
    s.addShape(ppt.ShapeType.roundRect, {
      x: 0.5, y: 2.0, w: 5.8, h: 0.7, fill: { color: C.red }, rectRadius: 0.1,
    });
    s.addText('异常记录', {
      x: 0.5, y: 2.0, w: 5.8, h: 0.7,
      fontSize: 16, fontFace: 'Microsoft YaHei', bold: true, color: C.white, align: 'center', valign: 'middle',
    });

    const exceptionSteps = [
      '发现质量问题 → 点"记录异常"',
      '选择缺陷类型：色差/电镀不良/划伤/沙眼/变形/其他',
      '填写影响数量',
      '选择处理方式：返回电镀/返回磨板/重做/特采/报废',
      '⏱ 目标操作时间：≤ 20 秒',
    ];
    exceptionSteps.forEach((step, i) => {
      s.addText(step, {
        x: 1.0, y: 3.0 + i * 0.65, w: 4.8, h: 0.5,
        fontSize: 12, fontFace: 'Microsoft YaHei', color: i === exceptionSteps.length - 1 ? C.gray : C.black,
      });
    });

    // 右：返工
    s.addShape(ppt.ShapeType.roundRect, {
      x: 7.0, y: 2.0, w: 5.8, h: 4.5, fill: { color: C.white },
      line: { color: C.orange, width: 2 }, rectRadius: 0.1,
    });
    s.addShape(ppt.ShapeType.roundRect, {
      x: 7.0, y: 2.0, w: 5.8, h: 0.7, fill: { color: C.orange }, rectRadius: 0.1,
    });
    s.addText('返工处理', {
      x: 7.0, y: 2.0, w: 5.8, h: 0.7,
      fontSize: 16, fontFace: 'Microsoft YaHei', bold: true, color: C.white, align: 'center', valign: 'middle',
    });

    const reworkSteps = [
      '工序需重做 → 点"返工"',
      '系统创建新的工序执行记录',
      '返工次数 +1（颜色自动加深标记）',
      '原记录保留（已完成过一次）',
      'V1 支持：同工序重做（覆盖 90% 场景）',
    ];
    reworkSteps.forEach((step, i) => {
      s.addText(step, {
        x: 7.5, y: 3.0 + i * 0.65, w: 4.8, h: 0.5,
        fontSize: 12, fontFace: 'Microsoft YaHei', color: i === reworkSteps.length - 1 ? C.gray : C.black,
      });
    });
  }

  // ============================================================
  // Slide 11: 数据验证方案
  // ============================================================
  {
    const s = ppt.addSlide();
    s.background = slideBg;
    addSlideTitle(s, '数据验证：在开发前用真实数据检验模型');

    const sheets = [
      { name: '部门清单', data: '5 行', color: C.blue },
      { name: '客户清单', data: '≥10 行', color: C.green },
      { name: '工序清单', data: '≥15 行', color: C.orange },
      { name: '工艺路线', data: '3-5 条', color: C.purple },
      { name: '历史订单', data: '10 张', color: C.red },
      { name: '工序执行记录', data: '⭐ 2-3 张完整路径', color: C.red },
      { name: '质量事件', data: '≥5 条', color: C.red },
      { name: '外协供应商', data: '可选', color: C.gray },
    ];

    sheets.forEach((sh, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = 0.5 + col * 3.15;
      const y = 2.0 + row * 2.4;

      s.addShape(ppt.ShapeType.roundRect, {
        x, y, w: 2.9, h: 1.8, fill: { color: C.white },
        line: { color: sh.color, width: 2 }, rectRadius: 0.1,
        shadow: { type: 'outer', blur: 2, offset: 1, color: 'D1D5DB', opacity: 0.3 },
      });
      s.addText(sh.name, {
        x, y: y + 0.2, w: 2.9, h: 0.5,
        fontSize: 14, fontFace: 'Microsoft YaHei', bold: true, color: C.black, align: 'center',
      });
      s.addText(sh.data, {
        x, y: y + 0.7, w: 2.9, h: 0.5,
        fontSize: 16, fontFace: 'Microsoft YaHei', bold: true, color: sh.color, align: 'center',
      });
    });

    s.addText('💡 关键：Sheet 6（工序执行记录）验证"订单追踪逻辑"是否与工厂真实流程一致。如果对不上，模型需要修正。', {
      x: 0.8, y: 6.6, w: 11.7, h: 0.5,
      fontSize: 12, fontFace: 'Microsoft YaHei', bold: true, color: C.red,
    });
  }

  // ============================================================
  // Slide 12: 现场需要确认的问题
  // ============================================================
  {
    const s = ppt.addSlide();
    s.background = slideBg;
    addSlideTitle(s, '需要工厂确认的关键问题');

    // 分类卡片
    const categories = [
      { title: '订单模型', qs: ['一单一规格？', '能否分批生产？', '交期谁定？'], color: C.blue },
      { title: '工艺路线', qs: ['几条标准路线？', '路线是否固定？', '能否临时增减工序？'], color: C.purple },
      { title: '质量异常', qs: ['QC节点在哪？', '常见缺陷类型？', '如何处理异常？'], color: C.red },
      { title: '返工模式', qs: ['同工序重做？', '退回前工序？', '最多返工几次？'], color: C.orange },
      { title: '外协管理', qs: ['涉及哪些工序？', '如何追踪进度？', '正式流程还是口头？'], color: C.green },
      { title: '使用场景', qs: ['几人操作系统？', '现场还是办公室？', '车间网络情况？'], color: C.gray },
    ];

    categories.forEach((cat, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = 0.5 + col * 4.2;
      const y = 2.0 + row * 2.5;

      s.addShape(ppt.ShapeType.roundRect, {
        x, y, w: 3.9, h: 2.1, fill: { color: C.white },
        line: { color: cat.color, width: 2 }, rectRadius: 0.1,
      });

      // 标题条
      s.addShape(ppt.ShapeType.roundRect, {
        x, y, w: 3.9, h: 0.55, fill: { color: cat.color }, rectRadius: 0.1,
      });
      s.addText(cat.title, {
        x, y, w: 3.9, h: 0.55,
        fontSize: 13, fontFace: 'Microsoft YaHei', bold: true, color: C.white, align: 'center', valign: 'middle',
      });

      cat.qs.forEach((q, qi) => {
        s.addText(`• ${q}`, {
          x: x + 0.3, y: y + 0.7 + qi * 0.4, w: 3.3, h: 0.35,
          fontSize: 11, fontFace: 'Microsoft YaHei', color: C.black,
        });
      });
    });

    s.addText('⚠ 共 26 个问题，其中 6 个为"否决级"——答案如果推翻假设，业务模型需要重新设计', {
      x: 0.8, y: 6.8, w: 11.7, h: 0.4,
      fontSize: 11, fontFace: 'Microsoft YaHei', bold: true, color: C.orange,
    });
  }

  // ============================================================
  // Slide 13: V1 版本边界
  // ============================================================
  {
    const s = ppt.addSlide();
    s.background = slideBg;
    addSlideTitle(s, 'V1 版本范围：先解决核心问题');

    // 包含
    s.addShape(ppt.ShapeType.roundRect, {
      x: 0.5, y: 2.0, w: 5.8, h: 4.5, fill: { color: C.lightGreen }, rectRadius: 0.1,
    });
    s.addText('✅ V1 包含', {
      x: 0.8, y: 2.1, w: 5, h: 0.5,
      fontSize: 16, fontFace: 'Microsoft YaHei', bold: true, color: C.green,
    });

    const includeItems = [
      '订单创建与管理',
      '工艺路线（预置3-5条）',
      '工序节点追踪（4种状态）',
      '一键推进（≤3秒）',
      '异常记录（类型+数量+处理）',
      '简单返工（同工序重做）',
      '交期预警（超期标红）',
      '状态回退（撤销操作）',
    ];
    includeItems.forEach((item, i) => {
      s.addText(`✓ ${item}`, {
        x: 1.0, y: 2.8 + i * 0.45, w: 5, h: 0.4,
        fontSize: 12, fontFace: 'Microsoft YaHei', color: C.black,
      });
    });

    // 不包含
    s.addShape(ppt.ShapeType.roundRect, {
      x: 7.0, y: 2.0, w: 5.8, h: 4.5, fill: { color: C.lightGray }, rectRadius: 0.1,
    });
    s.addText('⏸ 延后到 V1.5 / V2', {
      x: 7.3, y: 2.1, w: 5, h: 0.5,
      fontSize: 16, fontFace: 'Microsoft YaHei', bold: true, color: C.gray,
    });

    const deferItems = [
      ['外协管理', 'V1.5'],
      ['部门正式移交', 'V1.5'],
      ['首件确认', 'V2'],
      ['统计分析看板', 'V2'],
      ['多用户权限', 'V2'],
      ['离线模式', 'V2'],
      ['产品规格库', 'V2'],
      ['审计日志', 'V2'],
    ];
    deferItems.forEach(([item, ver], i) => {
      s.addText(`→ ${item}`, {
        x: 7.5, y: 2.8 + i * 0.45, w: 3.5, h: 0.4,
        fontSize: 12, fontFace: 'Microsoft YaHei', color: C.gray,
      });
      s.addText(ver, {
        x: 11.0, y: 2.8 + i * 0.45, w: 1.5, h: 0.4,
        fontSize: 10, fontFace: 'Microsoft YaHei', color: C.gray, align: 'right',
      });
    });
  }

  // ============================================================
  // Slide 14: 实施路线图
  // ============================================================
  {
    const s = ppt.addSlide();
    s.background = slideBg;
    addSlideTitle(s, '实施路线图');

    const phases = [
      {
        name: 'Phase 1\n业务验证',
        time: '2-3 周',
        color: C.green,
        items: ['录入真实工厂数据', '确认26个问题', '修正Business Model'],
      },
      {
        name: 'Phase 2\n原型设计',
        time: '4-6 周',
        color: C.blue,
        items: ['数据库表结构设计', '跟单员操作原型', '流程图界面设计'],
      },
      {
        name: 'Phase 3\n开发测试',
        time: '6-8 周',
        color: C.purple,
        items: ['V1 功能开发', '真实订单测试', '收集反馈优化'],
      },
      {
        name: 'Phase 4\n上线使用',
        time: '2-3 周',
        color: C.orange,
        items: ['正式环境部署', '跟单员培训', '日常使用支持'],
      },
    ];

    phases.forEach((p, i) => {
      const x = 0.4 + i * 3.2;

      // 阶段卡片
      s.addShape(ppt.ShapeType.roundRect, {
        x, y: 2.0, w: 2.9, h: 4.0, fill: { color: p.color }, rectRadius: 0.12,
      });
      s.addText(p.name, {
        x, y: 2.1, w: 2.9, h: 0.9,
        fontSize: 14, fontFace: 'Microsoft YaHei', bold: true, color: C.white, align: 'center', valign: 'middle',
      });
      s.addText(p.time, {
        x, y: 3.1, w: 2.9, h: 0.5,
        fontSize: 12, fontFace: 'Microsoft YaHei', color: 'D1D5DB', align: 'center',
      });

      // 分隔线
      s.addShape(ppt.ShapeType.rect, {
        x: x + 0.5, y: 3.7, w: 1.9, h: 0.02, fill: { color: 'FFFFFF', transparency: 67 }
      });

      p.items.forEach((item, ii) => {
        s.addText(`• ${item}`, {
          x: x + 0.3, y: 4.0 + ii * 0.55, w: 2.3, h: 0.5,
          fontSize: 10.5, fontFace: 'Microsoft YaHei', color: C.white,
        });
      });

      // 箭头连接
      if (i < phases.length - 1) {
        s.addText('→', {
          x: x + 2.9, y: 3.5, w: 0.4, h: 0.5,
          fontSize: 20, fontFace: 'Microsoft YaHei', bold: true, color: C.gray, align: 'center',
        });
      }
    });

    // 总时间
    s.addShape(ppt.ShapeType.roundRect, {
      x: 2.5, y: 6.4, w: 8.3, h: 0.6, fill: { color: C.navy }, rectRadius: 0.08,
    });
    s.addText('预计总周期：3-4 个月  |  当前进度：Phase 0（业务建模）|  下一步：工厂数据验证', {
      x: 2.8, y: 6.4, w: 7.8, h: 0.6,
      fontSize: 12, fontFace: 'Microsoft YaHei', bold: true, color: C.white, align: 'center', valign: 'middle',
    });
  }

  // ============================================================
  // Slide 15: 总结与下一步
  // ============================================================
  {
    const s = ppt.addSlide();
    s.background = { color: C.navy };

    s.addText('总结 & 下一步', {
      x: 1.5, y: 0.8, w: 8, h: 0.8,
      fontSize: 30, fontFace: 'Microsoft YaHei', bold: true, color: C.white,
    });

    s.addShape(ppt.ShapeType.rect, { x: 1.5, y: 1.7, w: 2.0, h: 0.05, fill: { color: C.green } });

    // 核心信息
    s.addText([
      { text: 'DialFactory 不从写代码开始。\n\n', options: { fontSize: 18, bold: true, color: C.white } },
      { text: '正确路径：\n', options: { fontSize: 14, bold: true, color: '9CA3AF' } },
      { text: '真实工厂业务 → 业务模型 → 数据验证 → 系统设计 → 开发上线\n\n', options: { fontSize: 14, color: 'D1D5DB' } },
      { text: '当前已完成：\n', options: { fontSize: 14, bold: true, color: C.green } },
      { text: '✅ Business Model V1  ·  ✅ 数据录入模板  ·  ✅ 现场确认问题清单\n\n', options: { fontSize: 13, color: C.white } },
      { text: '下一步：\n', options: { fontSize: 14, bold: true, color: C.green } },
      { text: '📋 使用真实工厂数据验证业务模型 → 修正模型 → 进入原型设计', options: { fontSize: 13, color: C.white } },
    ], {
      x: 1.5, y: 2.2, w: 10.3, h: 4.5, fontFace: 'Microsoft YaHei',
    });

    // 底部
    s.addShape(ppt.ShapeType.rect, { x: 1.5, y: 6.5, w: 10.3, h: 0.02, fill: { color: '374151' } });
    s.addText('DialFactory  |  表盘工厂生产管理数字化系统  |  2026年8月', {
      x: 1.5, y: 6.7, w: 10.3, h: 0.4,
      fontSize: 11, fontFace: 'Microsoft YaHei', color: '6B7280',
    });
  }

  // ============================================================
  // 保存
  // ============================================================
  const outPath = 'c:/Users/10515/Desktop/DialFactory/DialFactory_项目方案汇报.pptx';
  await ppt.writeFile({ fileName: outPath });
  console.log('✅ PPT 已生成：' + outPath);
  console.log(`  共计 ${ppt.slides.length} 页`);
}

main().catch(err => { console.error(err); process.exit(1); });
