import dotenv from 'dotenv';

dotenv.config();

/**
 * 凭据与关键端点的**唯一读取点**。
 *
 * 除本文件外，任何模块都不应直接读取这里涉及的 process.env 变量，
 * 以便默认值、"缺失时的行为"集中在一处。
 * 各链路的开关与白名单仍由 config/ 下各自模块解析。
 */

/** NeoDB API token；未设置时为 undefined。 */
export const NEODB_API_TOKEN = process.env.NEODB_API_TOKEN;

/** NeoDB 默认可见性等级（0 公开 / 1 关注者 / 2 私有）。 */
export const NEODB_VISIBILITY = Number(process.env.NEODB_VISIBILITY ?? 2);

/** 抓豆瓣 RSS 时伪装成浏览器 UA，避免机房 IP 被 WAF 拦截。 */
export const DOUBAN_RSS_USER_AGENT =
  process.env.DOUBAN_RSS_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
