// Categorias automáticas para lançamentos importados (cartão e conta).
// As regras do usuário (settings.importRules: { [merchantKey]: categoria }) vêm antes das automáticas.

import { normalize } from '../lib/util.js';

export const CAT = {
  transporte: 'Transporte por app',
  delivery: 'Delivery e restaurantes',
  mercado: 'Mercado',
  assinaturas: 'Assinaturas',
  online: 'Compras online',
  vestuario: 'Vestuário',
  saude: 'Saúde',
  educacao: 'Educação',
  filha: 'Filha',
  envios: 'Envios (Pix/PicPay)',
  combustivel: 'Combustível',
  juros: 'Juros e tarifas',
  outros: 'Outros',
};

/** Novas categorias de gasto que a importação pode criar (as que faltarem entram nas configurações). */
export const IMPORT_CATEGORIES = [CAT.transporte, CAT.delivery, CAT.mercado, CAT.assinaturas, CAT.online, CAT.vestuario, CAT.envios, CAT.combustivel, CAT.juros];

// A ordem importa: assinaturas antes de "compras online" (Amazon Prime x Amazon), filha antes de vestuário,
// farmácia pelo iFood ("Ifd*… Drogarias") como saúde.
const RULES = [
  [/\b(iof|juros|encargo|multa|anuidade|tarifa)\b/, CAT.juros],
  [/picpay|pix no credito|^pix\b|transferencia enviada|envio de dinheiro/, CAT.envios],
  [/uber|\b99\b|99 ?ride|99 ?pop|99app|^pop \d|^taxi \d|cabify|indriver|buser/, CAT.transporte],
  [/netflix|disney|spotify|amazonprime|prime video|apple\.com|icloud|google one|google g1|youtube|hbo|globoplay|deezer|paramount|chatgpt|openai|perplexity|microsoft|google cloud|claude|anthropic|canva|juridico ai|clipping|duolingo|crunchyroll/, CAT.assinaturas],
  [/leiturinha|infant|kids|crianca|bebe|baby|brinquedo|ri happy|pbkids/, CAT.filha],
  [/drogaria|farmacia|droga|raia|pacheco|drogasil|consulta|clinica|laborat|hospital|unimed|amil|odonto|dentist/, CAT.saude],
  [/renner|riachuelo|c&a|\bcea\b|zara|modas|lingerie|centauro|netshoes|hering|marisa|shein/, CAT.vestuario],
  [/\bifd\b|ifd\*|ifood|rappi|ze delivery|burguer|burger|pizza|restaurante|lanchonete|churrasc|padaria|coffee|mc ?donald|subway|habib/, CAT.delivery],
  [/assai|atacad|carrefour|supermerc|guanabara|prezunic|hortifruti|pao de acucar|zona sul|sams club|supermercado/, CAT.mercado],
  [/facuminas|faculdade|universidade|curso|escola|udemy|alura|cacd|livraria|hotmart|htm\*|estrategia|gran cursos/, CAT.educacao],
  [/posto|shell|ipiranga|petrobras|br mania|combust/, CAT.combustivel],
  [/amazon|shopee|mercado ?livre|magalu|magazine luiza|aliexpress|americanas|kabum|casas bahia/, CAT.online],
];

/** Categoria sugerida para uma linha importada ({ mk, raw }). */
export function guessCategory(row, rules = {}) {
  if (rules[row.mk]) return rules[row.mk];
  const t = normalize(row.raw || row.title || '');
  for (const [re, cat] of RULES) if (re.test(t)) return cat;
  return CAT.outros;
}
