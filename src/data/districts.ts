export interface DistrictMetric {
  /** 0-100 越高越好(对普通买房人友好) */
  score: number;
  label: string;
  detail?: string;
}

export interface District {
  id: string;
  name: string;
  zone: string;          // 海淀/西城/朝阳...
  unitPrice: number;     // 万元/㎡ (近 4 月成交均价,占位数据)
  yoy: number;           // 同比 % (负数为下跌)
  liquidity: DistrictMetric;       // 流动性(成交活跃度)
  affordability: DistrictMetric;   // 普通家庭可承担度
  school: DistrictMetric;          // 学区
  commute: DistrictMetric;         // 通勤
  policy: DistrictMetric;          // 政策利好
  highlights: string[];
  risks: string[];
}

/**
 * 数据为占位/示例,基于公开成交粗估,严禁作为投资依据。
 * 后续将由 ~/Downloads/{1,2,3,4,1-4}月成交.csv 真实成交导入。
 */
export const districts: District[] = [
  {
    id: "shangdi",
    name: "上地 / 西二旗",
    zone: "海淀",
    unitPrice: 8.6,
    yoy: -2.4,
    liquidity:    { score: 86, label: "高", detail: "互联网通勤刚需池,成交稳" },
    affordability:{ score: 48, label: "中",   detail: "70-90㎡ 总价 600-800 万" },
    school:       { score: 70, label: "中上", detail: "上地实验中游学区" },
    commute:      { score: 95, label: "极佳", detail: "13/昌平/京张紧邻互联网大厂" },
    policy:       { score: 78, label: "正面", detail: "回天行动二期落地" },
    highlights:   ["大厂步行通勤", "次新房比例高", "学区中游托底"],
    risks:        ["挂牌量近期上行", "总价依旧偏高,首套压力大"],
  },
  {
    id: "huilongguan",
    name: "回龙观",
    zone: "昌平",
    unitPrice: 5.4,
    yoy: -4.1,
    liquidity:    { score: 82, label: "高",   detail: "刚需池子最大,成交频繁" },
    affordability:{ score: 78, label: "高",   detail: "90-110㎡ 总价 480-600 万" },
    school:       { score: 55, label: "中",   detail: "昌平区前段学区" },
    commute:      { score: 80, label: "好",   detail: "13/8/昌平线 + 自行车专用路" },
    policy:       { score: 90, label: "极强", detail: "京政办发〔2026〕9 号 127 个项目" },
    highlights:   ["首套总价友好", "近期政策强催化", "13 号线扩能 + 19 号线二期"],
    risks:        ["小区年代偏老需挑次新", "局部学区差异大"],
  },
  {
    id: "qinghe",
    name: "清河",
    zone: "海淀",
    unitPrice: 7.8,
    yoy: -1.2,
    liquidity:    { score: 75, label: "中上", detail: "TOD + 改善并行" },
    affordability:{ score: 55, label: "中",   detail: "总价跨度大,580-900 万" },
    school:       { score: 65, label: "中上", detail: "海淀北部新晋学区" },
    commute:      { score: 88, label: "极佳", detail: "京张 + 13 + 27 号线 TOD" },
    policy:       { score: 72, label: "正面", detail: "TOD 持续兑现" },
    highlights:   ["京张高铁 TOD 红利", "海淀身份 + 通勤双买"],
    risks:        ["新房挂牌多分流二手", "板块内部分化"],
  },
  {
    id: "guangwai",
    name: "广外 / 白纸坊",
    zone: "西城",
    unitPrice: 8.2,
    yoy: -3.0,
    liquidity:    { score: 70, label: "中上", detail: "西城刚需托底" },
    affordability:{ score: 58, label: "中",   detail: "60-70㎡ 总价 500-580 万" },
    school:       { score: 92, label: "极强", detail: "西城学区身份" },
    commute:      { score: 78, label: "好",   detail: "7/14/16 号线" },
    policy:       { score: 60, label: "中",   detail: "西城整体平稳" },
    highlights:   ["以小换大锁定西城学区", "总价相对友好"],
    risks:        ["户型紧凑居住体验弱", "次新极少"],
  },
  {
    id: "wangjing",
    name: "望京",
    zone: "朝阳",
    unitPrice: 9.1,
    yoy: -2.0,
    liquidity:    { score: 80, label: "高",   detail: "外企 + 互联网双重需求" },
    affordability:{ score: 38, label: "偏低", detail: "次新两居 800-1100 万" },
    school:       { score: 68, label: "中上", detail: "朝阳前段学区" },
    commute:      { score: 90, label: "极佳", detail: "14/15/T2 多线" },
    policy:       { score: 65, label: "正面", detail: "副中心 + 国际消费" },
    highlights:   ["商业氛围 + 通勤强", "外企/科技就业池厚"],
    risks:        ["对纯刚需总价压力极大"],
  },
];
