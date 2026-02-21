/* 初中竞赛衔接·奥数训练（六年级）— v6-static
   - 题库：>=1000 题（当前 1050）
   - 题目按【知识点 topic】+【奥赛题型/模型 model】组织
   - 答案输入：优先数字；需要两个数字就两个空（多空同理）；支持分数 a/b
   - 变式追击：同题型/模型一次给出 12 题（>=10）
   - file:// 打开时，若 fetch JSON 失败，自动使用 data.js 兜底
*/
const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

const store = {
  get(key, fallback){
    try{
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    }catch(e){ return fallback; }
  },
  set(key, value){
    localStorage.setItem(key, JSON.stringify(value));
  }
};

const state = {
  data: null,
  view: "home",
  currentTopicId: null,
  currentProblemId: null,
  topicFilters: {}, // topicId -> model string or "__all"
  variantSeed: 1,

  // 组卷打印（本机）
  builder: {
    paperTitle: "筱萱的六年级奥数练习卷",
    topic: "__all",
    model: "__all",
    diff: "__all",
    q: "",
    page: 0,
    showSelectedOnly: false,
    withAnswer: false,
  },

  // 拍照批改（本机）
  scan: {
    imageInfo: null,   // {name, w, h}
    items: [],         // [{id, bbox}]
    status: "idle",    // idle|ready|detecting|done|error
    message: "",
  },
};

/* ------------------ 题型讲解（每个模型一个“方法模板”+例题） ------------------ */
const MODEL_GUIDES = {
  "余数周期（末位）": {
    summary: "求幂的个位数/末位，核心是找出个位的循环周期，把指数对周期取余。",
    steps: [
      "只看个位：先把底数对 10 取余，只保留末位。",
      "列出幂的个位循环（通常周期 ≤ 4）。",
      "用 指数 ÷ 周期 的余数定位到循环中的一项（余 0 视为周期本身）。"
    ],
    pitfalls: [
      "指数对周期取余得到 0 时，要取“最后一项”。",
      "末位是 0/1/5/6 时周期为 1；末位是 4/9 时周期为 2。"
    ]
  },
  "数位整除（模 9）": {
    summary: "判断能否被 9（或 3）整除，用“数位和同余”。常见问法：求某些数字的最大/最小值。",
    steps: [
      "先算已知数字的数位和。",
      "用 (数位和 + 未知部分) ≡ 0 (mod 9) 建立同余条件。",
      "在 0–18（两位数字之和）或对应范围内取最大/最小满足条件的值。"
    ],
    pitfalls: [
      "别忘了未知是“数字”（0–9），两位数字和在 0–18。",
      "只要看模 9，不需要真的把整个数写出来算。"
    ]
  },
  "互素化（gcd/lcm）": {
    summary: "已知 gcd 与 lcm 求两数：先“提公因数”，把问题变成互素因子分解。",
    steps: [
      "设两数为 g·a 与 g·b，其中 g=gcd，且 (a,b)=1。",
      "由 lcm = g·a·b 得到 a·b = lcm/g。",
      "在 ab 固定且互素的因子对里选需要的那一对（如和最小→尽量接近）。"
    ],
    pitfalls: [
      "关键条件是 (a,b)=1，不互素的因子对不能用。",
      "和最小不等于“最接近”就行，还要检查互素。"
    ]
  },
  "质因数分解（约数个数）": {
    summary: "求约数个数：先做质因数分解，再用指数公式。",
    steps: [
      "把 N 分解成质因数：N=∏p_i^{e_i}。",
      "约数个数 = ∏(e_i+1)。",
      "注意没有出现的质因数指数视为 0（不影响乘积）。"
    ],
    pitfalls: [
      "分解要完整：直到全部是质数。",
      "别把“约数个数”与“质因数个数”混淆。"
    ]
  },
  "同余构造（n≡-1）": {
    summary: "一组“除以 k 余 k-1”的题，统一成 n≡-1 (mod k)，转化为 n+1 被多整数整除。",
    steps: [
      "把条件写成 n ≡ -1 (mod k)。",
      "等价于 n+1 同时被这些 k 整除。",
      "所以 n+1 取这些 k 的最小公倍数（或其倍数），求最小正解。"
    ],
    pitfalls: [
      "是 n+1 被整除，不是 n。",
      "取最小解时通常取 n+1 = lcm(...)。"
    ]
  },
  "奇偶性与模 2": {
    summary: "只判断奇偶：抓住“偶数因子”或“配对抵消”，用模 2 思维快速做。",
    steps: [
      "把表达式拆成若干项，判断每一项奇偶。",
      "若每项都含偶数因子→整项为偶；偶数相加仍偶。",
      "必要时用公式（如 1+…+n 或前 n 个奇数和=n^2）判断奇偶。"
    ],
    pitfalls: [
      "别把“奇数个奇数相加为奇数”忘了。",
      "能用模 2 就不要做大数计算。"
    ]
  },

  "抽屉原理（差为 d）": {
    summary: "把数分到若干“抽屉/配对”里，只要选的数比抽屉多 1，就必有两数落同一抽屉。",
    steps: [
      "把 1–2d 配成 d 个抽屉：(1,1+d),(2,2+d),…。",
      "同一抽屉里的两数差为 d。",
      "要保证出现一对差为 d：至少选 d+1 个数。"
    ],
    pitfalls: [
      "先想清楚“抽屉怎么分”——分得好，答案就出来了。",
      "注意题目要求的是“必然存在”，不是“存在一种选法”。"
    ]
  },
  "分类计数（末位分类）": {
    summary: "能否被 2/5/10 等整除，往往只看个位。先按个位分情况，再乘剩余位的排列数。",
    steps: [
      "确定个位允许的数字集合（如被 2 整除→末位偶数）。",
      "固定个位后，首位（不能为 0）再选，注意不能与个位重复。",
      "中间各位从剩余数字做排列，最后把各情况相加。"
    ],
    pitfalls: [
      "首位不能为 0；且“各位不重复”会减少可选数。",
      "分情况时别漏掉末位=0 的特殊情况。"
    ]
  },
  "容斥原理（并集-交集）": {
    summary: "数“满足 A 或 B”就用容斥：|A∪B|=|A|+|B|-|A∩B|。数“只满足其一”再减掉交集。",
    steps: [
      "先算 |A|=⌊N/a⌋，|B|=⌊N/b⌋。",
      "交集是同时整除：|A∩B|=⌊N/lcm(a,b)⌋。",
      "只满足其一：|A|+|B|-2|A∩B|。"
    ],
    pitfalls: [
      "交集要用 lcm，不是用 a·b（除非互素）。",
      "题目如果要“至少一个/恰好一个”，公式不同，别套错。"
    ]
  },
  "排列（不相邻：捆绑法）": {
    summary: "不相邻问题常用：总数 − 相邻数。相邻时把那两个数捆成一个整体。",
    steps: [
      "先算总排列数 n!。",
      "算相邻：把 (1,2) 当一个整体（内部 12/21 两种），变成 (n-1)!×2。",
      "用 总数 − 相邻数 得答案。"
    ],
    pitfalls: [
      "捆绑后对象数量减少 1。",
      "内部顺序往往有 2 种（AB 或 BA）。"
    ]
  },
  "隔板法（正整数解）": {
    summary: "把“分球/分数”转成方程 x1+…+xk=m 的正整数解：在 m-1 个空隙放 k-1 块隔板。",
    steps: [
      "把问题写成正整数方程：x1+…+xk=m。",
      "用隔板法：从 m-1 个空隙中选 k-1 个放隔板。",
      "答案是 C(m-1,k-1)。"
    ],
    pitfalls: [
      "每盒至少 1 个 → 正整数解；允许 0 个 → 非负整数解（公式变 C(m+k-1,k-1)）。",
      "别把“相同盒/不同盒”搞混：隔板法默认盒子不同。"
    ]
  },
  "最值（禁止和为 S）": {
    summary: "禁止两数和为 S：把能凑成 S 的数配对，每对最多选 1 个 → 得到最大可选数。",
    steps: [
      "配对：(1,S-1),(2,S-2),…。",
      "每对最多选 1 个，否则会出现和为 S。",
      "数一数有多少对（以及 S 为偶数时中间的 S/2）。"
    ],
    pitfalls: [
      "配对要覆盖完整范围。",
      "S 为偶数时，S/2 不能和自己配对成两数（需要两次出现才行）。"
    ]
  },

  "平行线分比例": {
    summary: "遇到“过一点作平行线”，优先想到相似三角形，从而得到线段成比例。",
    steps: [
      "写出平行线带来的对应角相等。",
      "指出相似三角形（如 △CDE ∼ △CBA）。",
      "用相似比推出线段比例，必要时转成 AE:EC。"
    ],
    pitfalls: [
      "先找“同角/夹角”对应关系，不要乱比。",
      "比值写清楚分子分母对应的线段。"
    ]
  },
  "相似三角形求长": {
    summary: "平行线/角相等 → 相似 → 比例求边长。核心是找到正确的相似比。",
    steps: [
      "先判相似：一对角相等+另一对角相等。",
      "写出对应边比例（如 AD/AB = AE/AC）。",
      "代入已知边长求未知，必要时化成分数。"
    ],
    pitfalls: [
      "对应边不要写反，建议先写“谁对谁”。",
      "求长度时注意单位一致。"
    ]
  },
  "角平分线求角": {
    summary: "角平分线问题常用：角被分成两半 + 三角形内角和 180°。",
    steps: [
      "由角平分线得 ∠BAD = ∠CAD = ∠A/2。",
      "识别在 △ABD 或 △ACD 中哪些角已知。",
      "用内角和求目标角。"
    ],
    pitfalls: [
      "D 在 BC 上，所以 ∠ABD=∠ABC，∠ACD=∠ACB。",
      "别忘了单位是“度”。"
    ]
  },
  "面积比（夹角两边比）": {
    summary: "同顶点同夹角的两个三角形，面积比 = 夹角两边比的乘积。",
    steps: [
      "确认两个三角形的夹角相同（通常在顶点 A）。",
      "把 AD/AB、AE/AC 写成分数。",
      "面积比 S_ADE/S_ABC = (AD/AB)·(AE/AC)。"
    ],
    pitfalls: [
      "要同夹角才可直接用乘积。",
      "线段比最好先化成最简分数再相乘。"
    ]
  },
  "圆周角定理": {
    summary: "同弧所对：圆周角 = 圆心角的一半。",
    steps: [
      "确定圆心角与圆周角对应的是同一条弧 AB。",
      "用 ∠ACB = 1/2 ∠AOB。",
      "代入即可。"
    ],
    pitfalls: [
      "点 C 要在弧 AB 上（不含 A、B），否则对应弧可能不同。",
      "注意是“一半”。"
    ]
  },
  "直角三角形内切圆": {
    summary: "直角三角形内切圆半径 r 常用公式：r=(a+b-c)/2（a,b 为直角边，c 为斜边）。",
    steps: [
      "确认 a、b 是直角边，c 是斜边。",
      "用 r=(a+b-c)/2 直接计算（或用面积=rs）。",
      "检查 r 是否为正。"
    ],
    pitfalls: [
      "斜边必须是最长边。",
      "公式适用于直角三角形；一般三角形需用面积与半周长。"
    ]
  },

  "恒等变形（x+1/x）": {
    summary: "已知 x+1/x，常用平方： (x+1/x)^2 = x^2+2+1/x^2。",
    steps: [
      "两边平方得到 x^2+2+1/x^2。",
      "把已知值代入。",
      "移项得到 x^2+1/x^2。"
    ],
    pitfalls: [
      "别漏掉中间项 +2。",
      "前提 x≠0。"
    ]
  },
  "恒等变形（x-1/x）": {
    summary: "已知 x-1/x，平方： (x-1/x)^2 = x^2-2+1/x^2。",
    steps: [
      "两边平方得到 x^2-2+1/x^2。",
      "代入已知值。",
      "移项求 x^2+1/x^2。"
    ],
    pitfalls: [
      "这里是 −2，不要写成 +2。",
      "前提 x≠0。"
    ]
  },
  "对称式（a+b,ab）": {
    summary: "对称式常把 a^2+b^2、(a-b)^2 等写成 (a+b)、ab 的表达式。",
    steps: [
      "记住：(a+b)^2=a^2+2ab+b^2。",
      "所以 a^2+b^2=(a+b)^2-2ab。",
      "代入计算。"
    ],
    pitfalls: [
      "把 2ab 的符号写对。",
      "有些题会要 a^3+b^3 等，可继续用公式扩展。"
    ]
  },
  "因式分解（平方差巧算）": {
    summary: "遇到 (N-d)(N+d) 或相差很小的两个数相乘，用平方差：a^2-b^2。",
    steps: [
      "识别成 (A-B)(A+B) 的结构。",
      "套用公式：(A-B)(A+B)=A^2-B^2。",
      "先算平方再相减。"
    ],
    pitfalls: [
      "A 取“中间数”，B 取“差的一半”（例如 99×101 中 A=100,B=1）。",
      "别展开成四项，反而更慢。"
    ]
  },
  "方程思想（和与积求两数）": {
    summary: "已知 x+y 与 xy，常把 x、y 看成二次方程 t^2-St+P=0 的两根。",
    steps: [
      "设 t 为其中一个数，建立方程 t^2-(x+y)t+xy=0。",
      "尝试因式分解（找两个数乘积为 P、和为 S）。",
      "得到两根就是答案（顺序通常不限）。"
    ],
    pitfalls: [
      "注意题目是否要求整数/正数/不同等条件。",
      "分解不到时也可用判别式，但六年级多用分解更快。"
    ]
  },
  "不等式（和定积最大）": {
    summary: "在 a+b 固定时，ab 最大在 a=b，最大值为 (a+b)^2/4。",
    steps: [
      "用 (a-b)^2≥0 推出 a^2+b^2≥2ab。",
      "得到 (a+b)^2=a^2+2ab+b^2 ≥ 4ab。",
      "所以 ab ≤ (a+b)^2/4，且 a=b 时取等号。"
    ],
    pitfalls: [
      "题目若限制整数，最大值可能要取最接近的一对整数。",
      "别忘了“正数”条件（否则最大值可能不存在）。"
    ]
  },

  "工程（效率相加）": {
    summary: "工程题把“总工程量”设为 1，用效率相加更稳。",
    steps: [
      "设工程总量为 1。",
      "甲效率=1/m，乙效率=1/n（m,n 为单独完成时间）。",
      "合作效率相加，时间=1 ÷ (总效率)。"
    ],
    pitfalls: [
      "别把效率和时间搞反（效率越大时间越短）。",
      "若出现“先后做/中途加入”，分段计算工程量。"
    ]
  },
  "浓度（溶质守恒）": {
    summary: "浓度题核心是“溶质守恒”：盐的质量（或糖的质量）前后相等。",
    steps: [
      "写出“溶质质量=浓度×溶液质量”。",
      "混合后：溶质质量相加；总质量相加。",
      "列方程解未知（常是 x）。"
    ],
    pitfalls: [
      "百分数记得除以 100。",
      "看清题目是“加入”还是“倒掉再加入”。"
    ]
  },
  "年龄（设未知）": {
    summary: "年龄题关键：年龄差不变；用“现在/过去/未来”统一到同一时间点。",
    steps: [
      "先把题目给的“几年前/几年后”换算到“现在”的年龄。",
      "设再过 t 年（或 t 年前）满足某倍数/差关系。",
      "列一次方程求 t。"
    ],
    pitfalls: [
      "别把“几年前”理解成减错方向。",
      "倍数关系要写成方程（如 父+t = 2(子+t)）。"
    ]
  },
  "盈亏（两次分摊）": {
    summary: "盈亏模型：同一总价，两次“每人出多少”得到一差一多，列两式相等。",
    steps: [
      "设人数 p，总价 T。",
      "由“差 m”：T = x·p + m；由“多 n”：T = y·p − n。",
      "两式相等先求 p，再代回求 T。"
    ],
    pitfalls: [
      "“多 n”意味着实际付款总额超过总价，所以是 y·p = T + n。",
      "单位一致（元/角/分）。"
    ]
  },
  "鸡兔同笼": {
    summary: "鸡兔同笼常用“假设法”：先假设全是鸡，再用腿数差换算兔数。",
    steps: [
      "假设全是鸡：腿数=2×头数。",
      "腿数差=实际腿数−假设腿数。",
      "每只兔多 2 条腿：兔数=腿数差/2；鸡数=头数−兔数。"
    ],
    pitfalls: [
      "腿数差必须是 2 的倍数。",
      "如果是“鸡鸭/牛鹤”等，先找“每只多多少”。"
    ]
  },
  "植树（间隔模型）": {
    summary: "直线两端都栽树：棵数=间隔数+1；环形栽树：棵数=间隔数。",
    steps: [
      "先算间隔数=总长度/间隔。",
      "若两端都栽：棵数=间隔数+1。",
      "若首尾相接成环：棵数=间隔数。"
    ],
    pitfalls: [
      "题目是否“两端都栽/只栽一端/成环”会影响 +1。",
      "长度必须能整除间隔（或题目会给出整除条件）。"
    ]
  },

  "相遇（相对速度）": {
    summary: "相向而行：相对速度=速度之和；时间=路程/相对速度。",
    steps: [
      "相对速度 v= v1+v2。",
      "路程 D 已知。",
      "t=D/(v1+v2)。"
    ],
    pitfalls: [
      "单位要统一（km/h 与 m/s 不能混用）。",
      "若有出发时间差，要先算领先路程再相遇。"
    ]
  },
  "追及（相对速度）": {
    summary: "同向追及：相对速度=快−慢；时间=间距/相对速度。",
    steps: [
      "相对速度 v= v快−v慢。",
      "间距 D 已知。",
      "t=D/(v快−v慢)。"
    ],
    pitfalls: [
      "必须保证 v快>v慢，否则追不上。",
      "若中途停下/折返，分段处理。"
    ]
  },
  "火车过桥（路程=车长+桥长）": {
    summary: "过桥/过隧道：车头走的路程=车长+桥长。",
    steps: [
      "总路程=车长+桥长。",
      "用 t=路程/速度。",
      "若题目单位是 m/s 与 m，直接代入更快。"
    ],
    pitfalls: [
      "是“车尾离桥”才算完全通过。",
      "速度单位换算别错（1 m/s=3.6 km/h）。"
    ]
  },
  "流水行船（顺逆流）": {
    summary: "顺流/逆流：速度分别是 v±c（v 静水，c 水流）。",
    steps: [
      "顺流速度= v+c；逆流速度= v−c。",
      "分别用 t=路程/速度。",
      "常见问法：已知顺逆时间求 v、c（可列方程）。"
    ],
    pitfalls: [
      "必须 v>c，否则逆流速度为负/不合理。",
      "题目若给“往返”，注意两段时间相加。"
    ]
  },
  "环形跑道（相向/同向）": {
    summary: "环形跑道：相向第一次相遇合走 1 圈；同向再次相遇相当于追及 1 圈。",
    steps: [
      "相向：相对速度=v1+v2，路程=1 圈长度 L。",
      "同向：相对速度=|v1−v2|，路程=1 圈长度 L。",
      "t=L/相对速度。"
    ],
    pitfalls: [
      "同向要用差速，相向用和速。",
      "题目如果不是同点出发，要先算初始间隔（弧长）。"
    ]
  },
  "钟面重合（追及）": {
    summary: "钟面两针重合是“追及”模型：分针比时针快 5.5°/分。",
    steps: [
      "分针速度 6°/分，时针速度 0.5°/分。",
      "相对速度=5.5°/分=11/2°/分。",
      "时间=初始角度差 ÷ 相对速度。"
    ],
    pitfalls: [
      "初始角度差要算对（h:00 时差为 30h°）。",
      "有时题目问“第几次重合”，需要加上周期 720/11 分钟。"
    ]
  },

  "凑整巧算（平方差）": {
    summary: "两数很接近时，用平方差把乘法变成减法，速度更快。",
    steps: [
      "把 a×b 写成 (N−d)(N+d)。",
      "用公式 N^2−d^2。",
      "口算平方与小平方差。"
    ],
    pitfalls: [
      "N 选中间数，d 选差的一半。",
      "别展开成四项。"
    ]
  },
  "分数化简（通分）": {
    summary: "分式运算先通分，再把“除法”变成“乘倒数”，最后约分到最简。",
    steps: [
      "分别把分子、分母通分化成一个分数。",
      "分数÷分数=乘倒数。",
      "最后用 gcd 约分。"
    ],
    pitfalls: [
      "先约分可以减少数字大小。",
      "注意括号位置，别把分子分母弄反。"
    ]
  },
  "裂项求和（1/k-1/(k+1)）": {
    summary: "看到 1/[k(k+1)] 常裂项成 (1/k − 1/(k+1))，中间项会大量抵消。",
    steps: [
      "先裂项：1/[k(k+1)] = 1/k − 1/(k+1)。",
      "把前几项写出来观察抵消。",
      "只剩首尾：1 − 1/(n+1)。"
    ],
    pitfalls: [
      "裂项要写对符号。",
      "最后别忘了化简成最简分数。"
    ]
  },
  "数列求和（等差/三角数）": {
    summary: "等差数列求和用 S=m(首+末)/2；特殊的 1+2+…+n 用 n(n+1)/2。",
    steps: [
      "确认项数 m（从首项到末项共有几项）。",
      "用 S=m(首项+末项)/2。",
      "若是 1+…+n，直接用 n(n+1)/2。"
    ],
    pitfalls: [
      "项数 m 别数错（尤其是间隔不是 1 的时候）。",
      "首项/末项一定要对应正确。"
    ]
  },
  "代数技巧（差平方）": {
    summary: "A^2−B^2=(A−B)(A+B)。遇到两个平方的差，优先用公式，不要硬展开。",
    steps: [
      "认出 A 与 B。",
      "先算 A−B 和 A+B。",
      "相乘得到结果。"
    ],
    pitfalls: [
      "A、B 代入别弄反。",
      "若含括号，先把括号当整体。"
    ]
  },
  "循环规律（个位数）": {
    summary: "规律题本质还是“余数周期”：只看个位，指数取余定位循环。",
    steps: [
      "只保留底数个位。",
      "列出个位循环（周期通常 ≤ 4）。",
      "指数对周期取余（余 0 取周期）。"
    ],
    pitfalls: [
      "周期判断别猜：写出前 4 项就够。",
      "余 0 对应最后一项。"
    ]
  }
};

function buildModelGuideHTML(topicId, model, probsAll){
  if(!model || model === "__all") return "";
  const guide = MODEL_GUIDES[model] || null;
  const ex = probsAll.find(p => p.model === model);
  if(!ex) return "";

  const summary = guide ? guide.summary : "这是一个常见奥赛模型。建议：先识别题型→写出模板→代入计算→检查边界。";
  const steps = guide ? (guide.steps || []) : [];
  const pitfalls = guide ? (guide.pitfalls || []) : [];

  const stepsHTML = steps.length ? `
    <div style="margin-top:8px">
      <small style="color:var(--muted)">解题步骤（模板）：</small>
      <ul style="margin:6px 0 0 18px; padding:0">
        ${steps.map(s=>`<li style="margin:4px 0">${escapeHTML(s)}</li>`).join("")}
      </ul>
    </div>
  ` : "";

  const pitfallsHTML = pitfalls.length ? `
    <div style="margin-top:8px">
      <small style="color:var(--muted)">常见坑：</small>
      <ul style="margin:6px 0 0 18px; padding:0">
        ${pitfalls.map(s=>`<li style="margin:4px 0">${escapeHTML(s)}</li>`).join("")}
      </ul>
    </div>
  ` : "";

  const sol = ex.solution || "暂无解析。";
  return `
    <div class="help" id="modelGuide" style="margin-top:12px">
      <b>题型讲解：${escapeHTML(model)}</b><br/>
      ${escapeHTML(summary)}
      ${stepsHTML}
      ${pitfallsHTML}

      <details open style="margin-top:10px">
        <summary style="cursor:pointer; user-select:none">
          <b>例题讲解（点击展开）</b> <span style="color:var(--muted)">(建议先自己想 1 分钟)</span>
        </summary>
        <div class="statement" style="margin-top:10px">${escapeHTML(ex.statement).replaceAll("\n","<br/>")}</div>
        <div class="solution" style="margin-top:10px">${escapeHTML(sol).replaceAll("\n","<br/>")}</div>
        <div class="row">
          <button class="btn primary" id="openExample" data-problem="${ex.id}">去做这道例题</button>
        </div>
      </details>
    </div>
  `;
}

function nowISO(){ return new Date().toISOString(); }

function ensureProfile(){
  // v6-static：不依赖 server.py，学习记录保存在本机 localStorage
  // 兼容迁移：若存在旧版 profile_v5，则自动迁移到 profile_v6
  const profileNew = store.get("profile_v6", null);
  if(profileNew) return profileNew;

  const old = store.get("profile_v5", null);
  if(old){
    store.set("profile_v6", old);
    return old;
  }

  const p = {
    created_at: nowISO(),
    attempts: {},   // problem_id -> {count, correct, correct_count, last_at, best_time_sec, last_hint}
    points: 0,
    badges: [],
    daily: {},      // yyyy-mm-dd -> {solved, correct, time_sec}
  };
  store.set("profile_v6", p);
  return p;
}

function todayKey(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function addDaily(profile, delta){
  const k = todayKey();
  const cur = profile.daily[k] || {solved:0, correct:0, time_sec:0};
  cur.solved += delta.solved || 0;
  cur.correct += delta.correct || 0;
  cur.time_sec += delta.time_sec || 0;
  profile.daily[k] = cur;
}

function renderShell(contentHTML){
  const profile = ensureProfile();
  const total = state.data ? state.data.problems.length : 0;
  const app = $("#app");
  app.innerHTML = `
    <div class="container">
      <div class="topbar">
        <div class="brand">
          <div class="logo" aria-hidden="true"></div>
          <div>
            <h1>筱萱的奥数训练 · 初中竞赛衔接（六年级）</h1>
            <p>筱萱专属｜题库 ${total} 题｜知识点 × 题型｜组卷打印｜错题本｜拍照批改（本机）</p>
          </div>
        </div>
        <div class="nav">
          <button class="btn" data-nav="home">首页</button>
          <button class="btn" data-nav="topics">专题</button>
          <button class="btn" data-nav="builder">组卷打印</button>
          <button class="btn" data-nav="wrongbook">错题本</button>
          <button class="btn" data-nav="scan">拍照批改</button>
          <button class="btn" data-nav="arena">周赛</button>
          <button class="btn primary" data-nav="profile">画像</button>
        </div>
      </div>

      ${contentHTML}

      <div class="footer">
        <div>题库：<span style="font-family:var(--mono)">assets/data.json</span>（或离线兜底：<span style="font-family:var(--mono)">assets/data.js</span>）。</div>
        <div>建议：集中练同一题型 6–10 题 → 变式追击 10 题 → 总结方法与易错点。</div>
      </div>
    </div>
  `;

  $$(".nav .btn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const v = btn.getAttribute("data-nav");
      go(v);
    });
  });
}

function go(view, params={}){
  state.view = view;
  if(params.topicId !== undefined) state.currentTopicId = params.topicId;
  if(params.problemId !== undefined) state.currentProblemId = params.problemId;
  render();
}

function topicName(topicId){
  const t = state.data.topics.find(x=>x.id===topicId);
  return t ? t.name : topicId;
}

function difficultyWeight(level){
  const m = {"L1":1,"L2":1.2,"L3":1.5,"L4":1.9,"L5":2.4,"L6":3.0,"L7":3.6};
  return m[level] || 1.5;
}

function recommendNextProblem(topicId=null){
  const profile = ensureProfile();
  const probs = state.data.problems.filter(p => !topicId || p.topic_id===topicId);

  const scored = probs.map(p=>{
    const a = profile.attempts[p.id];
    const mastered = a && a.correct;
    const tries = a ? a.count : 0;
    const wrongPenalty = a && !a.correct ? 40 : 0;
    const masteredPenalty = mastered ? 80 : 0;
    const diffPenalty = difficultyWeight(p.difficulty)*6;
    const score = masteredPenalty + wrongPenalty + tries*4 + diffPenalty;
    return {p, score};
  }).sort((x,y)=>x.score-y.score);

  return scored.length ? scored[0].p : null;
}

/* ------------------ Views ------------------ */
function renderHome(){
  const profile = ensureProfile();
  const next = recommendNextProblem(null);
  const total = state.data.problems.length;
  const solved = Object.values(profile.attempts).filter(x=>x.correct).length;
  const correctAttempts = Object.values(profile.attempts).reduce((a,x)=>a+(x.correct_count||0),0);
  const attempts = Object.values(profile.attempts).reduce((a,x)=>a+(x.count||0),0);
  const acc = attempts ? Math.round(correctAttempts/attempts*100) : 0;

  const today = profile.daily[todayKey()] || {solved:0, correct:0, time_sec:0};
  const todayMin = Math.round((today.time_sec||0)/60);

  renderShell(`
    <div class="grid">
      <div class="card">
        <h2>今日任务</h2>
        <p>建议：选 1 个题型（模型）→ 连做 6–10 题 → 变式追击 10 题 → 复盘错因。</p>
        <div class="kv">
          <div class="box"><strong>题库进度</strong><span>${solved} / ${total}（已掌握）</span></div>
          <div class="box"><strong>总体正确率</strong><span>${acc}%</span></div>
          <div class="box"><strong>今日完成</strong><span>${today.solved} 题（${todayMin} 分钟）</span></div>
          <div class="box"><strong>积分</strong><span>${profile.points} pts</span></div>
        </div>
        <hr/>
        ${next ? `
          <div class="item">
            <div>
              <h3>推荐下一题：${escapeHTML(next.title)}</h3>
              <small>专题：${escapeHTML(topicName(next.topic_id))} · 题型：${escapeHTML(next.model || "—")}</small>
            </div>
            <div class="pill">${next.difficulty}</div>
          </div>
          <div class="row">
            <button class="btn primary" id="startNext">开始做题</button>
            <button class="btn" id="toTopics">去专题列表</button>
          </div>
        ` : `<p>题库为空，请在 assets/data.json 中加入题目。</p>`}
      </div>

      <div class="card">
        <h2>按知识点进入（再按题型筛选）</h2>
        <p>每个专题内包含 6 个核心题型（模型），每个题型 25 题，总计 1050 题。</p>
        <div class="list" id="topicList"></div>
      </div>
    </div>
  `);

  const list = $("#topicList");
  const profile2 = ensureProfile();
  state.data.topics.forEach(t=>{
    const probs = state.data.problems.filter(p=>p.topic_id===t.id);
    const solved2 = probs.filter(p => profile2.attempts[p.id] && profile2.attempts[p.id].correct).length;
    const models = Array.from(new Set(probs.map(p=>p.model).filter(Boolean)));
    list.insertAdjacentHTML("beforeend", `
      <div class="item">
        <div>
          <h3>${escapeHTML(t.name)}</h3>
          <small>${escapeHTML(t.desc)}</small><br/>
          <small>题型数：${models.length} · 进度：${solved2}/${probs.length}</small>
        </div>
        <button class="btn primary" data-topic="${t.id}">进入</button>
      </div>
    `);
  });
  $$("#topicList .btn.primary").forEach(b=>{
    b.addEventListener("click", ()=>go("topic", {topicId: b.getAttribute("data-topic")}));
  });

  if(next){
    $("#startNext").addEventListener("click", ()=>go("problem", {problemId: next.id}));
    $("#toTopics").addEventListener("click", ()=>go("topics"));
  }
}

function renderTopics(){
  renderShell(`
    <div class="card">
      <h2>专题列表</h2>
      <p>进入专题后可按“题型（模型）”筛选；变式追击一次给出 ≥10 题同模型练习。</p>
      <div class="list" id="allTopics"></div>
    </div>
  `);
  const el = $("#allTopics");
  const profile = ensureProfile();
  state.data.topics.forEach(t=>{
    const probs = state.data.problems.filter(p=>p.topic_id===t.id);
    const solved = probs.filter(p => profile.attempts[p.id] && profile.attempts[p.id].correct).length;
    const models = Array.from(new Set(probs.map(p=>p.model).filter(Boolean)));
    el.insertAdjacentHTML("beforeend", `
      <div class="item">
        <div>
          <h3>${escapeHTML(t.name)}</h3>
          <small>${escapeHTML(t.desc)}</small><br/>
          <small>题型：${models.length} · 进度：${solved}/${probs.length}</small>
        </div>
        <button class="btn primary" data-topic="${t.id}">进入专题</button>
      </div>
    `);
  });
  $$("#allTopics .btn.primary").forEach(b=>{
    b.addEventListener("click", ()=>go("topic", {topicId: b.getAttribute("data-topic")}));
  });
}

function renderTopic(topicId){
  const t = state.data.topics.find(x=>x.id===topicId);
  const profile = ensureProfile();
  const probsAll = state.data.problems.filter(p=>p.topic_id===topicId);

  const models = Array.from(new Set(probsAll.map(p=>p.model).filter(Boolean)));
  const current = state.topicFilters[topicId] || "__all";
  const example = current==="__all" ? null : probsAll.find(p=>p.model===current);
  const probs = current==="__all" ? probsAll : probsAll.filter(p=>p.model===current && (!example || p.id!==example.id));

  // Build list
  const items = probs.map(p=>{
    const a = profile.attempts[p.id];
    const status = a && a.correct ? "ok" : (a ? "bad" : "");
    const statusText = a && a.correct ? "已掌握" : (a ? "需复盘" : "未做");
    return `
      <div class="item">
        <div>
          <h3>${escapeHTML(p.title)}</h3>
          <small>${escapeHTML(p.model || "—")} · ${escapeHTML(statusText)} · 预计 ${Math.max(1, Math.round(p.time_estimate_sec/60))} 分钟</small>
        </div>
        <div class="problem-meta">
          <span class="pill">${p.difficulty}</span>
          <span class="pill">${escapeHTML(p.model || "—")}</span>
          <span class="pill ${status}">${statusText}</span>
          <button class="btn primary" data-problem="${p.id}">开始</button>
        </div>
      </div>
    `;
  }).join("");

  const chips = [
    `<button class="chip ${current==="__all"?"active":""}" data-model="__all">全部题型（${probsAll.length}）</button>`,
    ...models.map(m=>{
      const c = probsAll.filter(p=>p.model===m).length;
      return `<button class="chip ${current===m?"active":""}" data-model="${escapeHTML(m)}">${escapeHTML(m)}（${c}）</button>`;
    })
  ].join("");
  const guideHTML = buildModelGuideHTML(topicId, current, probsAll);


  renderShell(`
    <div class="card">
      <h2>${escapeHTML(t ? t.name : "专题")}</h2>
      <p>${escapeHTML(t ? t.desc : "")}</p>

      <div class="row">
        <button class="btn" id="backTopics">返回专题</button>
        <button class="btn primary" id="autoPick">推荐一题</button>
      </div>

      <div class="help">建议：先选一个题型（模型），连做 6–10 题，再点“变式追击（≥10题）”。</div>

      <div class="filters" id="modelFilters">${chips}</div>

      ${guideHTML}

      <div class="list">${items || "<p>该筛选下暂无题目。</p>"}</div>
    </div>
  `);

  $("#backTopics").addEventListener("click", ()=>go("topics"));
  $("#autoPick").addEventListener("click", ()=>{
    const p = recommendNextProblem(topicId);
    if(p) go("problem", {problemId: p.id});
  });

  $$("#modelFilters .chip").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const m = btn.getAttribute("data-model");
      state.topicFilters[topicId] = m;
      renderTopic(topicId);
    });
  });

  $$(".list .btn.primary").forEach(b=>{
    const pid = b.getAttribute("data-problem");
    if(pid) b.addEventListener("click", ()=>go("problem", {problemId: pid}));
  });

  const exBtn = $("#openExample");
  if(exBtn){
    exBtn.addEventListener("click", ()=>{
      const pid = exBtn.getAttribute("data-problem");
      if(pid) go("problem", {problemId: pid});
    });
  }

  // 题型页也可能含有 LaTeX（例题讲解），需要渲染
  typesetMath();
}

/* ------------------ Rational parsing with BigInt ------------------ */
function gcdBig(a, b){
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while(b !== 0n){
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}
function normRat(r){
  if(r.d === 0n) return null;
  if(r.d < 0n){ r.n = -r.n; r.d = -r.d; }
  const g = gcdBig(r.n, r.d);
  return { n: r.n / g, d: r.d / g };
}
function parseRational(str){
  if(str == null) return null;
  let s = String(str).trim();
  if(!s) return null;

  // allow Chinese punctuation
  s = s.replaceAll("：", ":").replaceAll("／","/");

  // fraction a/b
  if(s.includes("/")){
    const parts = s.split("/");
    if(parts.length !== 2) return null;
    const a = parts[0].trim();
    const b = parts[1].trim();
    if(!a || !b) return null;
    if(!/^[+-]?\d+$/.test(a) || !/^[+-]?\d+$/.test(b)) return null;
    const n = BigInt(a);
    const d = BigInt(b);
    if(d === 0n) return null;
    return normRat({n, d});
  }

  // integer or decimal
  if(!/^[+-]?\d+(\.\d+)?$/.test(s)) return null;
  const neg = s.startsWith("-");
  if(s.startsWith("+") || s.startsWith("-")) s = s.slice(1);
  if(s.includes(".")){
    const [ip, fp] = s.split(".");
    const frac = fp || "";
    const digits = (ip || "0") + frac;
    const n0 = BigInt(digits || "0");
    const d0 = 10n ** BigInt(frac.length);
    const n = neg ? -n0 : n0;
    return normRat({n, d: d0});
  }else{
    const n = BigInt((neg ? "-" : "") + s);
    return normRat({n, d: 1n});
  }
}
function ratEqual(a,b){
  return a.n * b.d === b.n * a.d;
}
function ratKey(r){
  return `${r.n.toString()}/${r.d.toString()}`;
}
function ratioEqual(userPair, ansPair){
  const [x,y] = userPair;
  const [a,b] = ansPair;
  const leftN = x.n * b.n;
  const leftD = x.d * b.d;
  const rightN = a.n * y.n;
  const rightD = a.d * y.d;
  return leftN * rightD === rightN * leftD;
}

/* ------------------ Problem page ------------------ */
function renderProblem(problemId){
  const p = state.data.problems.find(x=>x.id===problemId);
  const profile = ensureProfile();
  const a = profile.attempts[p.id];
  const best = a && a.best_time_sec ? `${Math.round(a.best_time_sec)}s` : "—";

  const startAt = Date.now();
  let hintLevelUsed = 0;

  const input = p.input || {kind:"blanks", count:1};
  const note = input.note || (input.kind==="text" ? "请写思路" : "只填数字");

  const answerBoxHTML = buildAnswerUI(input);

  renderShell(`
    <div class="card">
      <div class="problem-title">
        <h2>${escapeHTML(p.title)}</h2>
        <div class="problem-meta">
          <span class="pill">${escapeHTML(topicName(p.topic_id))}</span>
          <span class="pill">${escapeHTML(p.model || "—")}</span>
          <span class="pill">${p.difficulty}</span>
          <span class="pill">建议 ${Math.max(1, Math.round(p.time_estimate_sec/60))} 分钟</span>
          <span class="pill">最佳 ${best}</span>
        </div>
      </div>

      <div class="statement" id="stmt">${escapeHTML(p.statement).replaceAll("\n","<br/>")}</div>

      <div class="help">答题方式：${escapeHTML(note)}</div>

      ${answerBoxHTML}

      <div class="row">
        <button class="btn" id="hint1">提示 1</button>
        <button class="btn" id="hint2">提示 2</button>
        <button class="btn" id="hint3">提示 3</button>
      </div>

      <div class="row">
        <button class="btn primary" id="submit">提交判定</button>
        <button class="btn" id="showSol">查看解析</button>
        <button class="btn" id="back">返回</button>
      </div>

      <div id="feedback"></div>
      <div id="sol" style="display:none">
        <hr/>
        <div class="solution" id="solutionText"></div>
      </div>
    </div>
  `);

  const feedback = $("#feedback");

  function showHint(k){
    const idx = k-1;
    hintLevelUsed = Math.max(hintLevelUsed, k);
    const msg = p.hints && p.hints[idx] ? p.hints[idx] : "暂无提示。";
    feedback.insertAdjacentHTML("beforeend", `
      <div class="item" style="margin-top:10px">
        <div>
          <h3>提示 ${k}</h3>
          <small>${escapeHTML(msg)}</small>
        </div>
        <span class="pill">Hint</span>
      </div>
    `);
  }

  $("#hint1").addEventListener("click", ()=>showHint(1));
  $("#hint2").addEventListener("click", ()=>showHint(2));
  $("#hint3").addEventListener("click", ()=>showHint(3));

  $("#showSol").addEventListener("click", ()=>{
    $("#sol").style.display = "block";
    $("#solutionText").textContent = p.solution || "暂无解析。";
    typesetMath();
  });

  $("#back").addEventListener("click", ()=>{
    if(state.currentTopicId) go("topic", {topicId: state.currentTopicId});
    else go("home");
  });

  $("#submit").addEventListener("click", ()=>{
    const userInput = collectAnswerInput(input);
    const timeSpent = Math.max(1, Math.round((Date.now()-startAt)/1000));
    const correct = judge(p, userInput);

    const cur = profile.attempts[p.id] || {count:0, correct:false, correct_count:0, last_at:null, best_time_sec:null, last_hint:0};
    cur.count += 1;
    cur.last_at = nowISO();
    cur.last_hint = hintLevelUsed;

    if(correct){
      cur.correct = true;
      cur.correct_count = (cur.correct_count||0) + 1;
      if(cur.best_time_sec==null || timeSpent < cur.best_time_sec) cur.best_time_sec = timeSpent;

      const base = Math.round(10 * difficultyWeight(p.difficulty));
      const hintPenalty = hintLevelUsed * 2;
      const gained = Math.max(2, base - hintPenalty);
      profile.points += gained;

      addDaily(profile, {solved:1, correct:1, time_sec:timeSpent});
    }else{
      addDaily(profile, {solved:1, correct:0, time_sec:timeSpent});
    }

    profile.attempts[p.id] = cur;
    maybeAwardBadges(profile, p, correct, timeSpent, hintLevelUsed);

    store.set("profile_v6", profile);

    feedback.innerHTML = `
      <div class="item" style="margin-top:10px">
        <div>
          <h3>${correct ? "✅ 判定：正确" : "❌ 判定：不正确"}</h3>
          <small>用时：${timeSpent}s；提示：${hintLevelUsed} 级。${correct ? "可以做同题型变式或下一题。" : "建议先开提示，再试一次或看解析。"} </small>
        </div>
        <span class="pill ${correct?"ok":"bad"}">${correct ? "Correct" : "Try again"}</span>
      </div>

      ${correct ? `
        <div class="row">
          <button class="btn primary" id="nextBtn">下一题</button>
          <button class="btn" id="variantBtn">变式追击（≥10题）</button>
        </div>
      ` : `
        <div class="row">
          <button class="btn primary" id="retryBtn">再试一次</button>
          <button class="btn" id="openSolBtn">打开解析</button>
        </div>
      `}
    `;

    if(correct){
      $("#nextBtn").addEventListener("click", ()=>{
        const next = recommendNextProblem(null);
        if(next) go("problem", {problemId: next.id});
      });
      $("#variantBtn").addEventListener("click", ()=>{
        go("variants", {problemId: p.id});
      });
    }else{
      $("#retryBtn").addEventListener("click", ()=>{
        const first = $(".ans-input") || $("#answerText");
        if(first) first.focus();
      });
      $("#openSolBtn").addEventListener("click", ()=>{
        $("#sol").style.display = "block";
        $("#solutionText").textContent = p.solution || "暂无解析。";
        typesetMath();
      });
    }
  });

  typesetMath();
}

function buildAnswerUI(input){
  if(input.kind === "text"){
    return `<textarea id="answerText" placeholder="请输入你的证明/思路（可分条）。"></textarea>`;
  }

  // numeric blanks
  const count = Math.max(1, input.count || 1);
  const labels = input.labels || [];
  const gridClass = count === 1 ? "" : "ans-grid";
  const fields = [];
  for(let i=0;i<count;i++){
    const label = labels[i] || `第 ${i+1} 空`;
    fields.push(`
      <div class="ans-field">
        <label>${escapeHTML(label)}</label>
        <input class="ans-input" data-idx="${i}" inputmode="decimal" placeholder="例如：12 或 8/3" />
      </div>
    `);
  }
  return `<div class="${gridClass}">${fields.join("")}</div>`;
}

function collectAnswerInput(input){
  if(input.kind === "text"){
    return {kind:"text", text: ($("#answerText").value || "").trim()};
  }
  const arr = $$(".ans-input").map(el => (el.value || "").trim());
  return {kind:"blanks", values: arr};
}

function judge(p, userInput){
  const input = p.input || {kind:"blanks", count:1};

  if(input.kind === "text"){
    const text = (userInput.text || "").trim();
    if(!text) return false;
    const minLen = input.min_len || 60;
    const kws = input.keywords || [];
    const passLen = text.length >= minLen;
    const passKw = kws.length ? kws.every(k => text.includes(k)) : false;
    return passLen || passKw;
  }

  const ansArr = (p.answer || []).map(x => parseRational(x)).filter(x=>x!=null);
  const userArr = (userInput.values || []).map(x => parseRational(x));

  if(userArr.some(x=>x==null)) return false;
  if(ansArr.length !== userArr.length) return false;

  const check = input.check || "exact";

  if(check === "ratio" && ansArr.length === 2){
    return ratioEqual(userArr, ansArr);
  }

  if(input.unordered){
    const aKeys = ansArr.map(ratKey).sort();
    const uKeys = userArr.map(ratKey).sort();
    for(let i=0;i<aKeys.length;i++){
      if(aKeys[i] !== uKeys[i]) return false;
    }
    return true;
  }

  for(let i=0;i<ansArr.length;i++){
    if(!ratEqual(ansArr[i], userArr[i])) return false;
  }
  return true;
}

function maybeAwardBadges(profile, p, correct, timeSpent, hintLevel){
  const already = new Set(profile.badges || []);
  const add = (b)=>{ if(!already.has(b)){ profile.badges.push(b); already.add(b); } };

  if(correct && hintLevel===0) add("零提示通关");
  if(correct && timeSpent <= Math.max(60, Math.round(p.time_estimate_sec*0.6))) add("速度之星");
  if(correct && p.difficulty==="L4") add("综合题突破");
  if(correct && (p.difficulty==="L5" || p.difficulty==="L6" || p.difficulty==="L7")) add("挑战者");
}

/* ------------------ Variants: same model, same topic ------------------ */
function seededShuffle(arr, seed){
  // simple deterministic-ish shuffle
  let x = seed || 1;
  function rand(){
    // xorshift32
    x ^= x << 13; x ^= x >> 17; x ^= x << 5;
    // convert to [0,1)
    return ((x >>> 0) / 4294967296);
  }
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(rand() * (i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickVariants(base, k=12){
  const same = state.data.problems.filter(p =>
    p.topic_id===base.topic_id && p.model===base.model && p.id!==base.id
  );
  const seed = (state.variantSeed || 1) + (hashStr(base.id) % 997);
  const shuffled = seededShuffle(same, seed);
  return shuffled.slice(0, Math.min(k, shuffled.length));
}

function hashStr(s){
  let h = 2166136261;
  for(let i=0;i<s.length;i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function renderVariants(problemId){
  const base = state.data.problems.find(x=>x.id===problemId);
  const pick = pickVariants(base, 12);

  renderShell(`
    <div class="card">
      <h2>变式追击（同题型/模型 ≥10 题）</h2>
      <p>原题：<b>${escapeHTML(base.title)}</b><br/>专题：${escapeHTML(topicName(base.topic_id))} · 题型：${escapeHTML(base.model)}</p>

      <div class="row">
        <button class="btn" id="refresh">换一批（同题型）</button>
        <button class="btn primary" id="backProblem">返回原题</button>
        <button class="btn" id="goTopic">回到专题</button>
      </div>

      <div class="list" id="varList"></div>
    </div>
  `);

  const el = $("#varList");
  if(pick.length < 10){
    el.innerHTML = `<p>该题型的题目数量不足 10 个变式（当前仅 ${pick.length}）。请扩充题库后再试。</p>`;
  }else{
    pick.forEach(v=>{
      el.insertAdjacentHTML("beforeend", `
        <div class="item">
          <div>
            <h3>${escapeHTML(v.title)}</h3>
            <small>${escapeHTML(v.model)} · ${v.difficulty}</small>
          </div>
          <button class="btn primary" data-vid="${v.id}">开始</button>
        </div>
      `);
    });
    $$("#varList .btn.primary").forEach(b=>{
      b.addEventListener("click", ()=>{
        const vid = b.getAttribute("data-vid");
        go("problem", {problemId: vid});
      });
    });
  }

  $("#refresh").addEventListener("click", ()=>{
    state.variantSeed += 77;
    renderVariants(base.id);
  });
  $("#backProblem").addEventListener("click", ()=>go("problem", {problemId: base.id}));
  $("#goTopic").addEventListener("click", ()=>go("topic", {topicId: base.topic_id}));
}

/* ------------------ Arena & Profile ------------------ */
function renderArena(){
  // Demo paper: take 8 questions across difficulties
  const probs = [...state.data.problems].sort((a,b)=>difficultyWeight(a.difficulty)-difficultyWeight(b.difficulty));
  const paper = [
    ...probs.slice(0,2),
    ...probs.slice(200,202),
    ...probs.slice(500,502),
    ...probs.slice(900,902),
  ].slice(0,8);

  const items = paper.map((p,i)=>`
    <div class="item">
      <div>
        <h3>第 ${i+1} 题：${escapeHTML(p.title)}</h3>
        <small>${escapeHTML(topicName(p.topic_id))} · ${escapeHTML(p.model||"—")} · ${p.difficulty}</small>
      </div>
      <button class="btn primary" data-p="${p.id}">开始</button>
    </div>
  `).join("");

  renderShell(`
    <div class="card">
      <h2>周赛（演示）</h2>
      <p>当前为演示版：从题库抽取 8 题。后续可扩展为完整计时试卷与自动出卷策略。</p>
      <div class="list">${items || "<p>题库不足，请先扩充题库。</p>"}</div>
    </div>
  `);

  $$(".list .btn.primary").forEach(b=>{
    b.addEventListener("click", ()=>go("problem", {problemId: b.getAttribute("data-p")}));
  });
}

function renderProfile(){
  const profile = ensureProfile();
  const attempts = profile.attempts || {};
  const totalAttempts = Object.values(attempts).reduce((a,x)=>a+(x.count||0),0);
  const solved = Object.values(attempts).filter(x=>x.correct).length;
  const correctCount = Object.values(attempts).reduce((a,x)=>a+(x.correct_count||0),0);
  const acc = totalAttempts ? Math.round(correctCount/totalAttempts*100) : 0;

  const rows = state.data.topics.map(t=>{
    const probs = state.data.problems.filter(p=>p.topic_id===t.id);
    const s = probs.filter(p=>attempts[p.id] && attempts[p.id].correct).length;
    const ratio = probs.length ? Math.round(s/probs.length*100) : 0;
    return {t, ratio, s, n: probs.length};
  }).sort((a,b)=>b.ratio-a.ratio);

  const badges = (profile.badges || []).slice(-12).map(b=>`<span class="pill ok">${escapeHTML(b)}</span>`).join(" ");

  renderShell(`
    <div class="grid">
      <div class="card">
        <h2>能力画像（简版）</h2>
        <p>画像基于“已掌握/题库”。更精细的题型掌握度可继续升级（ELO/Bayes）。</p>
        <div class="kv">
          <div class="box"><strong>已掌握题目</strong><span>${solved}</span></div>
          <div class="box"><strong>总正确率</strong><span>${acc}%</span></div>
          <div class="box"><strong>总作答次数</strong><span>${totalAttempts}</span></div>
          <div class="box"><strong>积分</strong><span>${profile.points} pts</span></div>
        </div>
        <hr/>
        <div><small style="color:var(--muted)">最近徽章：</small></div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">${badges || "<span class='pill'>暂无</span>"}</div>
        <div class="row" style="margin-top:14px">
          <button class="btn" id="reset">清空数据（本机）</button>
          <button class="btn primary" id="export">导出学习记录</button>
        </div>
      </div>

      <div class="card">
        <h2>专题掌握度</h2>
        <p>建议：优先补“低掌握度专题”，并在专题内按题型（模型）集中练习。</p>
        <div class="list" id="topicMastery"></div>
      </div>
    </div>
  `);

  const el = $("#topicMastery");
  rows.forEach(r=>{
    el.insertAdjacentHTML("beforeend", `
      <div class="item">
        <div>
          <h3>${escapeHTML(r.t.name)}</h3>
          <small>掌握：${r.s}/${r.n}</small>
        </div>
        <div class="problem-meta">
          <span class="pill">${r.ratio}%</span>
          <button class="btn primary" data-topic="${r.t.id}">去训练</button>
        </div>
      </div>
    `);
  });

  $$("#topicMastery .btn.primary").forEach(b=>{
    b.addEventListener("click", ()=>go("topic", {topicId: b.getAttribute("data-topic")}));
  });

  $("#reset").addEventListener("click", ()=>{
    localStorage.removeItem("profile_v6");
    go("home");
  });

  $("#export").addEventListener("click", ()=>{
    const blob = new Blob([JSON.stringify(store.get("profile_v6", {}), null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "learning_record.json";
    a.click();
    URL.revokeObjectURL(url);
  });
}


/* ================== 组卷打印（不依赖 server.py） ==================
   说明：
   - “生成 PDF”采用浏览器打印：打开打印版页面 → Ctrl+P / 打印 → 选择“另存为 PDF”
     优点：中文与公式显示更稳，不需要在前端嵌入巨大的中文字体。
   - “生成 Word”导出为 .doc（HTML 格式），Word/WPS 可直接打开并另存为 docx。
   - 为拍照批改做准备：打印版每题左侧带 QR（已打包到单文件 assets/qrcode_pack.js），便于识别题目编号。
*/

function getPaperSelection(){
  return new Set(store.get("paper_selection_v6", []));
}
function setPaperSelection(selSet){
  store.set("paper_selection_v6", Array.from(selSet));
}

function normalizeTextForSearch(s){
  return String(s||"").replaceAll(/\s+/g, " ").trim().toLowerCase();
}

function filteredProblemsForBuilder(){
  const f = state.builder;
  const q = normalizeTextForSearch(f.q);
  let arr = state.data.problems.slice();

  if(f.topic && f.topic !== "__all"){
    arr = arr.filter(p => p.topic_id === f.topic);
  }
  if(f.model && f.model !== "__all"){
    arr = arr.filter(p => (p.model || "") === f.model);
  }
  if(f.diff && f.diff !== "__all"){
    arr = arr.filter(p => p.difficulty === f.diff);
  }
  if(q){
    arr = arr.filter(p=>{
      const hay = normalizeTextForSearch(p.title) + " " + normalizeTextForSearch(p.statement) + " " + normalizeTextForSearch(p.model);
      return hay.includes(q);
    });
  }
  if(f.showSelectedOnly){
    const sel = getPaperSelection();
    arr = arr.filter(p => sel.has(p.id));
  }
  return arr;
}

function openPrintView(ids, paperTitle, withAnswer){
  if(!ids || !ids.length){
    alert("请先勾选至少 1 道题。");
    return;
  }

  const baseHref = new URL(".", location.href).href;
  const title = paperTitle || "练习卷";

  // Build HTML
  const questions = ids.map((id, idx)=>{
    const p = state.data.problems.find(x=>x.id===id);
    if(!p) return "";
    const input = p.input || {kind:"blanks", count:1};
    const blankCount = (input.kind==="text") ? 0 : Math.max(1, input.count || 1);

    const boxes = blankCount ? Array.from({length: blankCount}).map((_,i)=>`<span class="abox" title="第${i+1}空"></span>`).join("") : `<span class="abox wide" title="作答区"></span>`;

    const answerHtml = withAnswer ? `
      <div class="answerKey">
        <div><b>答案：</b>${escapeHTML((p.answer||[]).join(" , "))}</div>
        ${p.solution ? `<div style="margin-top:6px"><b>解析要点：</b>${escapeHTML(p.solution).replaceAll("\n","<br/>")}</div>` : ""}
      </div>
    ` : "";

    const meta = `${escapeHTML(topicName(p.topic_id))} · ${escapeHTML(p.model||"—")} · ${p.difficulty} · ID:${p.id}`;

    return `
      <div class="q">
        <div class="qhead">
          <div class="qleft">
            <img class="qr" data-qid="${escapeHTML(p.id)}" alt="${escapeHTML(p.id)}" />
          </div>
          <div class="qright">
            <div class="qmeta">${idx+1}. ${meta}</div>
            <div class="aboxRow">${boxes}</div>
          </div>
        </div>
        <div class="qbody">${escapeHTML(p.statement).replaceAll("\n","<br/>")}</div>
        <div class="work">
          <div class="line"></div>
          <div class="line"></div>
          <div class="line"></div>
        </div>
        ${answerHtml}
      </div>
    `;
  }).join("");

  const printCSS = `
    @page { size: A4; margin: 14mm; }
    body{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB","Microsoft YaHei", Arial, sans-serif; color:#111; }
    .toolbar{ position: sticky; top:0; background:#fff; border-bottom:1px solid #ddd; padding:10px 0; z-index:10; }
    .toolbar .wrap{ max-width: 860px; margin:0 auto; display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:0 10px;}
    .btn{ border:1px solid #ccc; background:#f7f7f7; padding:8px 10px; border-radius:10px; cursor:pointer; font-size:13px;}
    .btn.primary{ background:#eaf2ff; border-color:#b8d2ff;}
    .wrap{ max-width: 860px; margin:0 auto; padding: 0 10px; }
    h1{ font-size:18px; margin:14px 0 4px 0; }
    .sub{ color:#666; font-size:12px; margin-bottom:10px;}
    .q{ border:1px solid #eee; border-radius:12px; padding:10px 10px 8px 10px; margin:10px 0; page-break-inside: avoid; }
    .qhead{ display:flex; gap:10px; align-items:flex-start; }
    .qr{ width:70px; height:70px; border:1px solid #eee; border-radius:8px; }
    .qmeta{ font-size:12px; color:#444; margin-bottom:6px; }
    .aboxRow{ display:flex; gap:8px; flex-wrap:wrap; }
    .abox{ display:inline-block; width:92px; height:26px; border:1.6px solid #333; border-radius:6px; }
    .abox.wide{ width:220px; }
    .qbody{ margin-top:8px; font-size:14px; line-height:1.6; }
    .work{ margin-top:8px; }
    .work .line{ height:18px; border-bottom:1px dashed #bbb; margin-top:8px;}
    .answerKey{ margin-top:10px; padding:10px; border-radius:10px; background:#fff7e6; border:1px solid #ffe2a8; font-size:12px; line-height:1.55;}
    @media print{
      .toolbar{ display:none; }
      .q{ border-color:#ddd; }
    }
  `;

  const html = `
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <base href="${baseHref}">
  <title>${escapeHTML(title)}</title>
  <style>${printCSS}</style>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
</head>
<body>
  <div class="toolbar">
    <div class="wrap">
      <button class="btn primary" onclick="window.print()">打印 / 另存为 PDF</button>
      <button class="btn" onclick="window.close()">关闭</button>
      <span style="color:#666;font-size:12px">提示：打印对话框里选择“另存为 PDF”。</span>
    </div>
  </div>

  <div class="wrap">
    <h1>${escapeHTML(title)}</h1>
    <div class="sub">姓名：筱萱 · 题目数量：${ids.length} · 生成时间：${new Date().toLocaleString()}</div>
    ${questions}
  </div>

  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
  <script src="./assets/qrcode_pack.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>
  <script>
    try{
      const pack = window.__QRCODE_PACK__ || {};
      document.querySelectorAll("img.qr[data-qid]").forEach(img=>{
        const id = img.getAttribute("data-qid");
        if(pack[id]) img.src = pack[id];
      });
    }catch(e){}
    window.addEventListener("load", () => {

      try{
        if(window.renderMathInElement){
          renderMathInElement(document.body, {
            delimiters: [
              {left: "$$", right: "$$", display: true},
              {left: "$", right: "$", display: false},
              {left: "\\\\(", right: "\\\\)", display: false},
              {left: "\\\\[", right: "\\\\]", display: true},
            ],
            throwOnError: false
          });
        }
      }catch(e){}
    });
  </script>
</body>
</html>
  `;

  const w = window.open("", "_blank");
  if(!w){
    alert("浏览器阻止了弹窗。请允许本页面打开新窗口后再试。");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function exportWordDoc(ids, paperTitle, withAnswer){
  if(!ids || !ids.length){
    alert("请先勾选至少 1 道题。");
    return;
  }
  const title = paperTitle || "练习卷";
  const parts = [];
  parts.push(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHTML(title)}</title></head><body>`);
  parts.push(`<h1>${escapeHTML(title)}</h1>`);
  parts.push(`<div>姓名：筱萱 · 题目数量：${ids.length} · 导出时间：${new Date().toLocaleString()}</div><hr/>`);

  ids.forEach((id, idx)=>{
    const p = state.data.problems.find(x=>x.id===id);
    if(!p) return;
    const meta = `${topicName(p.topic_id)} · ${p.model||"—"} · ${p.difficulty} · ID:${p.id}`;
    parts.push(`<h3>${idx+1}. ${escapeHTML(p.title)}</h3>`);
    parts.push(`<div style="color:#666;font-size:12px">${escapeHTML(meta)}</div>`);
    parts.push(`<div style="margin-top:6px;line-height:1.6">${escapeHTML(p.statement).replaceAll("\n","<br/>")}</div>`);
    parts.push(`<div style="margin-top:10px;margin-bottom:10px;border-bottom:1px dashed #bbb;height:20px"></div>`);
    parts.push(`<div style="margin-bottom:10px;border-bottom:1px dashed #bbb;height:20px"></div>`);
    parts.push(`<div style="margin-bottom:10px;border-bottom:1px dashed #bbb;height:20px"></div>`);
    if(withAnswer){
      parts.push(`<div style="background:#fff7e6;border:1px solid #ffe2a8;padding:10px;border-radius:10px">`);
      parts.push(`<b>答案：</b>${escapeHTML((p.answer||[]).join(" , "))}<br/>`);
      if(p.solution){
        parts.push(`<div style="margin-top:6px"><b>解析要点：</b><br/>${escapeHTML(p.solution).replaceAll("\n","<br/>")}</div>`);
      }
      parts.push(`</div>`);
    }
    parts.push(`<div style="page-break-after:always"></div>`);
  });

  parts.push(`</body></html>`);
  const html = parts.join("");
  const blob = new Blob(["\ufeff", html], {type: "application/msword"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${title}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
}

/* ---------- Builder Page ---------- */
function renderBuilder(){
  const f = state.builder;
  const selection = getPaperSelection();

  const topics = [{id:"__all", name:"全部专题"}].concat(state.data.topics.map(t=>({id:t.id, name:t.name})));
  const diffs = ["__all","L1","L2","L3","L4","L5","L6","L7"];

  // model list depends on topic
  let modelList = ["__all"];
  const baseArr = (f.topic==="__all") ? state.data.problems : state.data.problems.filter(p=>p.topic_id===f.topic);
  modelList = modelList.concat(Array.from(new Set(baseArr.map(p=>p.model).filter(Boolean))).sort());

  // Filtered problems
  const filtered = filteredProblemsForBuilder();
  const pageSize = 40;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  f.page = Math.min(Math.max(0, f.page), pageCount-1);
  const pageItems = filtered.slice(f.page*pageSize, f.page*pageSize + pageSize);

  renderShell(`
    <div class="card">
      <h2>组卷打印（不依赖 server.py）</h2>
      <p>你可以勾选题目，生成打印版（用于打印或另存为 PDF）以及 Word 文档（.doc）。</p>

      <div class="kv">
        <div class="box">
          <strong>试卷标题</strong>
          <input id="paperTitle" value="${escapeHTML(f.paperTitle)}" placeholder="例如：第1周 综合训练卷" />
        </div>
        <div class="box">
          <strong>选题数量</strong>
          <span>${selection.size} 题</span>
        </div>
      </div>

      <div class="help">
        ✅ “生成 PDF”采用浏览器打印：打开打印版 → 打印 → 选择“另存为 PDF”。<br/>
        ✅ 打印版每题带二维码（题目 ID，二维码已合并为单文件），方便后续“拍照批改”识别题目。<br/>
        ⚠️ 如果点击按钮没反应，请检查浏览器是否拦截弹窗。
      </div>

      <div class="filters" style="margin-top:10px">
        <span class="pill">筛选</span>
        <select id="fTopic" class="btn">
          ${topics.map(t=>`<option value="${t.id}" ${t.id===f.topic?"selected":""}>${escapeHTML(t.name)}</option>`).join("")}
        </select>
        <select id="fModel" class="btn">
          ${modelList.map(m=>`<option value="${escapeHTML(m)}" ${m===f.model?"selected":""}>${escapeHTML(m==="__all"?"全部题型":m)}</option>`).join("")}
        </select>
        <select id="fDiff" class="btn">
          ${diffs.map(d=>`<option value="${d}" ${d===f.diff?"selected":""}>${d==="__all"?"全部难度":d}</option>`).join("")}
        </select>
        <input id="fQ" class="btn" style="min-width:180px" value="${escapeHTML(f.q)}" placeholder="关键词（标题/题干/题型）" />
        <button class="btn ${f.showSelectedOnly?"primary":""}" id="toggleSelected">${f.showSelectedOnly?"只看已选：开":"只看已选：关"}</button>
        <button class="btn" id="clearSel">清空选题</button>
      </div>

      <div class="row" style="margin-top:10px">
        <button class="btn" id="selectPage">全选本页</button>
        <button class="btn primary" id="openPrint">打开打印版（PDF）</button>
        <button class="btn" id="openPrintAns">打印版（含答案）</button>
        <button class="btn" id="exportDoc">导出 Word（.doc）</button>
      </div>

      <hr/>
      <div class="help">当前筛选：${filtered.length} 题；第 ${f.page+1}/${pageCount} 页（每页 ${pageSize} 题）。</div>

      <div class="list" id="builderList"></div>

      <div class="row" style="margin-top:12px">
        <button class="btn" id="prevPage">上一页</button>
        <button class="btn" id="nextPage">下一页</button>
        <button class="btn" id="toWrongbook">从错题本加入选题</button>
      </div>
    </div>
  `);

  const list = $("#builderList");
  if(!pageItems.length){
    list.innerHTML = `<p>当前筛选下没有题目。</p>`;
  }else{
    pageItems.forEach(p=>{
      const checked = selection.has(p.id);
      list.insertAdjacentHTML("beforeend", `
        <div class="item">
          <div style="display:flex;gap:10px;align-items:flex-start">
            <input type="checkbox" data-id="${p.id}" ${checked?"checked":""} style="margin-top:4px;transform:scale(1.15)"/>
            <div>
              <h3>${escapeHTML(p.title)}</h3>
              <small>${escapeHTML(topicName(p.topic_id))} · ${escapeHTML(p.model||"—")} · ${p.difficulty} · ID:${p.id}</small>
            </div>
          </div>
          <button class="btn" data-preview="${p.id}">预览</button>
        </div>
      `);
    });
  }

  // Events
  $("#paperTitle").addEventListener("input", (e)=>{
    state.builder.paperTitle = e.target.value;
  });

  $("#fTopic").addEventListener("change", (e)=>{
    state.builder.topic = e.target.value;
    state.builder.model = "__all";
    state.builder.page = 0;
    renderBuilder();
  });
  $("#fModel").addEventListener("change", (e)=>{
    state.builder.model = e.target.value;
    state.builder.page = 0;
    renderBuilder();
  });
  $("#fDiff").addEventListener("change", (e)=>{
    state.builder.diff = e.target.value;
    state.builder.page = 0;
    renderBuilder();
  });
  $("#fQ").addEventListener("input", (e)=>{
    state.builder.q = e.target.value;
    state.builder.page = 0;
    renderBuilder();
  });

  $("#toggleSelected").addEventListener("click", ()=>{
    state.builder.showSelectedOnly = !state.builder.showSelectedOnly;
    state.builder.page = 0;
    renderBuilder();
  });

  $("#clearSel").addEventListener("click", ()=>{
    setPaperSelection(new Set());
    renderBuilder();
  });

  $("#selectPage").addEventListener("click", ()=>{
    const sel = getPaperSelection();
    pageItems.forEach(p=>sel.add(p.id));
    setPaperSelection(sel);
    renderBuilder();
  });

  $("#openPrint").addEventListener("click", ()=>{
    const sel = Array.from(getPaperSelection());
    openPrintView(sel, state.builder.paperTitle, false);
  });
  $("#openPrintAns").addEventListener("click", ()=>{
    const sel = Array.from(getPaperSelection());
    openPrintView(sel, state.builder.paperTitle + "（答案版）", true);
  });
  $("#exportDoc").addEventListener("click", ()=>{
    const sel = Array.from(getPaperSelection());
    exportWordDoc(sel, state.builder.paperTitle, state.builder.withAnswer);
  });

  $("#prevPage").addEventListener("click", ()=>{
    state.builder.page = Math.max(0, state.builder.page-1);
    renderBuilder();
  });
  $("#nextPage").addEventListener("click", ()=>{
    state.builder.page = state.builder.page + 1;
    renderBuilder();
  });

  $("#toWrongbook").addEventListener("click", ()=>{
    go("wrongbook");
  });

  // checkbox toggles
  $$(`#builderList input[type="checkbox"]`).forEach(cb=>{
    cb.addEventListener("change", ()=>{
      const id = cb.getAttribute("data-id");
      const sel = getPaperSelection();
      if(cb.checked) sel.add(id); else sel.delete(id);
      setPaperSelection(sel);
      // update count quickly without rerender? simplest rerender
      renderBuilder();
    });
  });

  // preview
  $$(`#builderList .btn[data-preview]`).forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-preview");
      const p = state.data.problems.find(x=>x.id===id);
      if(!p) return;
      alert(`${p.title}\n\n${p.statement}`);
    });
  });
}

/* ---------- Wrongbook Page ---------- */
function getWrongbookHidden(){
  return new Set(store.get("wrong_hidden_v6", []));
}
function setWrongbookHidden(set0){
  store.set("wrong_hidden_v6", Array.from(set0));
}

function wrongProblems(){
  const profile = ensureProfile();
  const hidden = getWrongbookHidden();
  const arr = [];
  for(const p of state.data.problems){
    const a = profile.attempts[p.id];
    if(!a) continue;
    const wrongCount = (a.count||0) - (a.correct_count||0);
    if(wrongCount <= 0) continue;
    if(a.correct) continue; // 已掌握就不作为错题本展示
    if(hidden.has(p.id)) continue;
    arr.push({p, wrongCount, tries: a.count||0});
  }
  // sort: more wrong first, then higher difficulty
  arr.sort((x,y)=>{
    if(y.wrongCount !== x.wrongCount) return y.wrongCount - x.wrongCount;
    return difficultyWeight(y.p.difficulty) - difficultyWeight(x.p.difficulty);
  });
  return arr;
}

function renderWrongbook(){
  const items = wrongProblems();
  const selection = getPaperSelection();

  const listHtml = items.map(({p, wrongCount, tries})=>`
    <div class="item">
      <div>
        <h3>${escapeHTML(p.title)}</h3>
        <small>${escapeHTML(topicName(p.topic_id))} · ${escapeHTML(p.model||"—")} · ${p.difficulty} · 错 ${wrongCount} / 做 ${tries} · ID:${p.id}</small>
      </div>
      <div class="problem-meta">
        <button class="btn" data-add="${p.id}">${selection.has(p.id) ? "已加入组卷" : "加入组卷"}</button>
        <button class="btn primary" data-go="${p.id}">再练</button>
        <button class="btn" data-hide="${p.id}">隐藏</button>
      </div>
    </div>
  `).join("");

  renderShell(`
    <div class="card">
      <h2>错题本（本机）</h2>
      <p>规则：做错过且尚未“已掌握”的题会在这里出现。你可以一键加入“组卷打印”，导出错题练习卷。</p>

      <div class="row">
        <button class="btn primary" id="exportWrongPrint">导出错题打印版（PDF）</button>
        <button class="btn" id="exportWrongDoc">导出错题 Word（.doc）</button>
        <button class="btn" id="clearHidden">恢复被隐藏的错题</button>
        <button class="btn" id="toBuilder">去组卷打印</button>
      </div>

      <div class="help">当前错题：${items.length} 题。提示：导出 PDF 使用浏览器打印另存即可。</div>

      <div class="list" id="wrongList">
        ${listHtml || "<p>暂无错题（或已全部掌握）。</p>"}
      </div>
    </div>
  `);

  $("#toBuilder").addEventListener("click", ()=>go("builder"));

  $("#exportWrongPrint").addEventListener("click", ()=>{
    const ids = items.map(x=>x.p.id);
    openPrintView(ids, "错题练习卷", false);
  });
  $("#exportWrongDoc").addEventListener("click", ()=>{
    const ids = items.map(x=>x.p.id);
    exportWordDoc(ids, "错题练习卷", false);
  });

  $("#clearHidden").addEventListener("click", ()=>{
    setWrongbookHidden(new Set());
    renderWrongbook();
  });

  $$(`#wrongList .btn[data-go]`).forEach(btn=>{
    btn.addEventListener("click", ()=>go("problem", {problemId: btn.getAttribute("data-go")}));
  });
  $$(`#wrongList .btn[data-add]`).forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-add");
      const sel = getPaperSelection();
      if(sel.has(id)) sel.delete(id); else sel.add(id);
      setPaperSelection(sel);
      renderWrongbook();
    });
  });
  $$(`#wrongList .btn[data-hide]`).forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-hide");
      const hidden = getWrongbookHidden();
      hidden.add(id);
      setWrongbookHidden(hidden);
      renderWrongbook();
    });
  });
}

/* ================== 拍照批改（本机） ==================
   说明：
   - 不依赖 server.py。
   - 识别题目：依赖打印版左侧的二维码（assets/qrcode）。
   - 判定：自动判对/错，并写入本机学习记录（profile_v6）。
   - 手写答案 OCR：纯前端做“完全自动识别”成本很高且准确率受字迹/拍摄角度影响。
     本版本提供“题目识别 + 手动录入答案 + 自动判定入库”，并预留 OCR 按钮（实验）。
*/

async function detectBarcodesFromImage(imgEl){
  if(!("BarcodeDetector" in window)){
    throw new Error("当前浏览器不支持 BarcodeDetector（二维码识别）。建议使用最新版 Chrome 或 Edge。");
  }
  const detector = new BarcodeDetector({formats: ["qr_code"]});
  const bitmap = await createImageBitmap(imgEl);
  const codes = await detector.detect(bitmap);
  return codes || [];
}

function renderScan(){
  const s = state.scan;
  const support = ("BarcodeDetector" in window);

  const listHtml = (s.items||[]).map((it, idx)=>{
    const p = state.data.problems.find(x=>x.id===it.id);
    if(!p) return "";
    const input = p.input || {kind:"blanks", count:1};
    const blankCount = (input.kind==="text") ? 1 : Math.max(1, input.count||1);
    const fields = Array.from({length: blankCount}).map((_,i)=>`
      <input class="ans-input scan-ans" data-pid="${it.id}" data-idx="${i}" placeholder="第${i+1}空：如 12 或 8/3" />
    `).join("");
    return `
      <div class="item">
        <div style="flex:1">
          <h3>${escapeHTML(p.title)}</h3>
          <small>${escapeHTML(topicName(p.topic_id))} · ${escapeHTML(p.model||"—")} · ${p.difficulty} · ID:${p.id}</small>
          <div class="ans-grid" style="margin-top:8px">${fields}</div>
        </div>
        <div class="problem-meta">
          <span class="pill">${p.difficulty}</span>
          <button class="btn" data-open="${p.id}">查看题目</button>
        </div>
      </div>
    `;
  }).join("");

  renderShell(`
    <div class="card">
      <h2>拍照批改（本机）</h2>
      <p>上传你打印出的练习卷照片。系统会先识别二维码得到“做了哪些题”，然后你可以录入（或尝试 OCR）答案，系统自动判定并写入错题本。</p>

      <div class="help">
        ✅ 推荐：使用本系统「组卷打印」生成的打印版（每题带二维码）。<br/>
        ✅ 拍照建议：光线充足、尽量正拍、不要严重倾斜；一张照片尽量包含多道题的二维码。<br/>
        ⚠️ 当前版本默认“手动录入答案”，OCR 识别手写答案属于实验功能（受字迹影响大）。
      </div>

      <div class="row">
        <input type="file" id="scanFile" accept="image/*" class="btn" />
        <button class="btn primary" id="detectBtn" ${support?"":"disabled"}>识别二维码</button>
        <button class="btn" id="judgeBtn" ${s.items.length? "" : "disabled"}>判定并记录</button>
        <button class="btn" id="ocrBtn" ${s.items.length? "" : "disabled"}>尝试 OCR（实验）</button>
      </div>

      <div class="help">${support ? "二维码识别：可用。" : "⚠️ 当前浏览器不支持二维码识别。请使用最新版 Chrome/Edge。"} ${escapeHTML(s.message||"")}</div>

      <div style="margin-top:10px">
        <img id="scanPreview" style="max-width:100%;border-radius:14px;border:1px solid var(--border);display:${s.imageInfo?"block":"none"}" />
      </div>

      <hr/>
      <h2 style="font-size:15px;margin-top:0">识别到的题目</h2>
      <div class="list" id="scanList">
        ${listHtml || "<p>尚未识别到题目。</p>"}
      </div>
    </div>
  `);

  const fileEl = $("#scanFile");
  const preview = $("#scanPreview");

  fileEl.addEventListener("change", ()=>{
    const file = fileEl.files && fileEl.files[0];
    if(!file) return;
    const url = URL.createObjectURL(file);
    preview.src = url;
    preview.onload = ()=>{
      state.scan.imageInfo = {name:file.name, w: preview.naturalWidth, h: preview.naturalHeight};
      state.scan.items = [];
      state.scan.message = `已加载图片：${file.name}（${preview.naturalWidth}×${preview.naturalHeight}）`;
      renderScan();
    };
  });

  $("#detectBtn").addEventListener("click", async ()=>{
    const img = $("#scanPreview");
    if(!img || !img.src){
      alert("请先选择并加载图片。");
      return;
    }
    state.scan.status = "detecting";
    state.scan.message = "正在识别二维码…";
    renderScan();
    try{
      const codes = await detectBarcodesFromImage(img);
      const idsFound = [];
      const items = [];
      for(const c of codes){
        const id = String(c.rawValue||"").trim();
        if(!id) continue;
        if(idsFound.includes(id)) continue;
        // verify exists
        if(!state.data.problems.find(p=>p.id===id)) continue;
        idsFound.push(id);
        items.push({id, bbox: c.boundingBox || null});
      }
      // sort by y then x to match reading order
      items.sort((a,b)=>{
        const ay = a.bbox ? a.bbox.y : 0;
        const by = b.bbox ? b.bbox.y : 0;
        if(Math.abs(ay-by) > 20) return ay-by;
        const ax = a.bbox ? a.bbox.x : 0;
        const bx = b.bbox ? b.bbox.x : 0;
        return ax-bx;
      });

      state.scan.items = items;
      state.scan.status = "done";
      state.scan.message = `识别到 ${items.length} 个题目二维码。若数量偏少，请换更清晰/更正的照片再试。`;
      renderScan();
    }catch(e){
      state.scan.status = "error";
      state.scan.message = e.message || String(e);
      renderScan();
    }
  });

  $("#judgeBtn").addEventListener("click", ()=>{
    const items = state.scan.items || [];
    if(!items.length){
      alert("尚未识别到题目。");
      return;
    }
    const profile = ensureProfile();
    let correctN = 0;
    let doneN = 0;

    items.forEach(it=>{
      const p = state.data.problems.find(x=>x.id===it.id);
      if(!p) return;
      const input = p.input || {kind:"blanks", count:1};
      const blankCount = (input.kind==="text") ? 1 : Math.max(1, input.count||1);
      const vals = [];
      for(let i=0;i<blankCount;i++){
        const el = document.querySelector(`.scan-ans[data-pid="${it.id}"][data-idx="${i}"]`);
        vals.push((el && el.value ? el.value.trim() : ""));
      }
      if(vals.some(v=>!v)){
        return; // skip incomplete
      }
      doneN += 1;
      const ok = judge(p, {kind:"blanks", values: vals});
      if(ok) correctN += 1;

      const cur = profile.attempts[p.id] || {count:0, correct:false, correct_count:0, last_at:null, best_time_sec:null, last_hint:0};
      cur.count += 1;
      cur.last_at = nowISO();
      cur.last_hint = 0;
      if(ok){
        cur.correct_count = (cur.correct_count||0) + 1;
        cur.correct = true;
        // points
        const gained = Math.max(2, Math.round(10 * difficultyWeight(p.difficulty)));
        profile.points += gained;
        addDaily(profile, {solved:1, correct:1, time_sec:0});
      }else{
        addDaily(profile, {solved:1, correct:0, time_sec:0});
      }
      profile.attempts[p.id] = cur;
    });

    store.set("profile_v6", profile);
    alert(`已记录：${doneN} 题（正确 ${correctN} 题）。\n未填写完整答案的题目不会记录。`);
    go("wrongbook");
  });

  $("#ocrBtn").addEventListener("click", async ()=>{
    alert("OCR（识别手写答案）属于实验功能：需要加载较大的 OCR 模型且准确率受字迹影响。\n当前版本暂未内置离线 OCR。建议先手动录入答案再判定。");
  });

  $$(`#scanList .btn[data-open]`).forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-open");
      const p = state.data.problems.find(x=>x.id===id);
      if(p) alert(`${p.title}\n\n${p.statement}\n\n标准答案：${(p.answer||[]).join(" , ")}`);
    });
  });
}


/* ------------------ Utils ------------------ */
function escapeHTML(s){
  return String(s||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function typesetMath(){
  try{
    if(window.renderMathInElement){
      renderMathInElement(document.body, {
        delimiters: [
          {left: "$$", right: "$$", display: true},
          {left: "$", right: "$", display: false},
          {left: "\\(", right: "\\)", display: false},
          {left: "\\[", right: "\\]", display: true},
        ],
        throwOnError: false
      });
    }
  }catch(e){}
}

/* ------------------ Router ------------------ */
function render(){
  if(!state.data) return;
  if(state.view==="home") return renderHome();
  if(state.view==="topics") return renderTopics();
  if(state.view==="topic") return renderTopic(state.currentTopicId);
  if(state.view==="problem") return renderProblem(state.currentProblemId);
  if(state.view==="variants") return renderVariants(state.currentProblemId);

  if(state.view==="builder") return renderBuilder();
  if(state.view==="wrongbook") return renderWrongbook();
  if(state.view==="scan") return renderScan();

  if(state.view==="arena") return renderArena();
  if(state.view==="profile") return renderProfile();
  return renderHome();
}

async function loadData(){
  try{
    const res = await fetch("./assets/data.json", {cache:"no-store"});
    if(!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  }catch(err){
    if(window.__DATA__) return window.__DATA__;
    throw err;
  }
}

async function boot(){
  try{
    state.data = await loadData();
    ensureProfile();
    go("home");
  }catch(err){
    renderShell(`
      <div class="card">
        <h2>加载题库失败</h2>
        <p>可能原因：浏览器限制 file:// 读取本地文件，或 assets 文件不完整。</p>
        <div class="help">
          解决办法：<br/>
          1）确认已解压压缩包；<br/>
          2）推荐用本地服务器打开：在目录运行 <span style="font-family:var(--mono)">python3 -m http.server 8000</span>，然后访问 <span style="font-family:var(--mono)">http://localhost:8000</span>；<br/>
          3）若仍失败，请检查是否存在 <span style="font-family:var(--mono)">assets/data.js</span>（离线兜底题库）。
        </div>
      </div>
    `);
  }
}

boot();
