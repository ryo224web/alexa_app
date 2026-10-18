// Alexa → Notion 買い物リスト追加スキル
const Alexa = require('ask-sdk-core');
const https = require('https');
const { NOTION_TOKEN, NOTION_DATABASE_ID } = require('./config');

const NOTION_VERSION = '2026-03-11';
const SKILL_NAME = 'おつかいメモ';

// 「と」で分割してはいけない品名（誤分割が見つかったらここに追加）
const NO_SPLIT_WORDS = [
  'ごまとうふ',
  'やまといも'
];

// ---------- Notion API ----------
function notionRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      'Authorization': `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
    };
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request(
      { hostname: 'api.notion.com', path: '/v1' + path, method, headers, timeout: 6000 },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let json = {};
          try {
            json = raw ? JSON.parse(raw) : {};
          } catch (e) {
            return reject(new Error('Notion応答のJSON解析に失敗: ' + raw));
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`Notion API ${res.statusCode}: ${json.code || ''} ${json.message || raw}`));
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Notion API タイムアウト')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// データベースIDを整形（URLやハイフン付きでもOK）
function normalizeDatabaseId(value) {
  const match = String(value).replace(/-/g, '').match(/[0-9a-f]{32}/i);
  if (!match) throw new Error('NOTION_DATABASE_ID が正しくありません');
  return match[0];
}

// データベースからデータソースIDを取得（初回のみ問い合わせ、以後はキャッシュ）
let cachedDataSourceId = null;
async function getDataSourceId() {
  if (cachedDataSourceId) return cachedDataSourceId;
  const dbId = normalizeDatabaseId(NOTION_DATABASE_ID);
  const db = await notionRequest('GET', `/databases/${dbId}`);
  const source = db.data_sources && db.data_sources[0];
  if (!source || !source.id) throw new Error('データソースが見つかりません');
  cachedDataSourceId = source.id;
  return cachedDataSourceId;
}

// 1品をNotionに追加（タイトル列は名前に関係なく "title" で指定できる）
async function addItemToNotion(name) {
  const dataSourceId = await getDataSourceId();
  return notionRequest('POST', '/pages', {
    parent: { type: 'data_source_id', data_source_id: dataSourceId },
    properties: {
      title: { title: [{ type: 'text', text: { content: name } }] }
    }
  });
}

// ---------- 品名の分割 ----------
// ひらがな・カタカナ1文字だけの断片かどうか（漢字1文字は品物として有効）
function isInvalidFragment(s) {
  if (!s) return true;
  return s.length === 1 && /^[぀-ゟ゠-ヿ]$/.test(s);
}

// 「卵とパン」「牛乳、卵」を別々の品に分ける
function splitItems(text) {
  const cleaned = String(text).trim();
  const parts = cleaned.split(/[、,，・]+/);
  const result = [];
  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;

    if (NO_SPLIT_WORDS.includes(p)) {
      result.push(p);
      continue;
    }

    const pieces = p.split('と').map((s) => s.trim());
    if (pieces.length > 1 && !pieces.some(isInvalidFragment)) {
      result.push(...pieces);
    } else {
      result.push(p);
    }
  }
  return [...new Set(result)].slice(0, 10);
}

// ---------- ハンドラー ----------
const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    const speak = `${SKILL_NAME}です。追加したいものを言ってください。`;
    return handlerInput.responseBuilder
      .speak(speak)
      .reprompt('たとえば、牛乳を追加して、と言ってください。')
      .getResponse();
  }
};

const AddItemIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AddItemIntent';
  },
  async handle(handlerInput) {
    const raw = Alexa.getSlotValue(handlerInput.requestEnvelope, 'item');
    if (!raw) {
      return handlerInput.responseBuilder
        .speak('何を追加しますか？')
        .reprompt('追加したいものを言ってください。')
        .getResponse();
    }

    const items = splitItems(raw);
    if (items.length === 0) {
      return handlerInput.responseBuilder
        .speak('うまく聞き取れませんでした。もう一度言ってください。')
        .reprompt('追加したいものを言ってください。')
        .getResponse();
    }

    try {
      for (const item of items) {
        await addItemToNotion(item);
      }
      return handlerInput.responseBuilder
        .speak(`${items.join('、')}を${SKILL_NAME}に追加しました。`)
        .getResponse();
    } catch (error) {
      console.log('Notion追加エラー:', error.message);
      return handlerInput.responseBuilder
        .speak('ノーションへの追加に失敗しました。しばらくしてからもう一度お試しください。')
        .getResponse();
    }
  }
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const speak = '買いたいものを、牛乳を追加して、のように言うと、ノーションの買い物リストに追加します。何を追加しますか？';
    return handlerInput.responseBuilder.speak(speak).reprompt('追加したいものを言ってください。').getResponse();
  }
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && ['AMAZON.CancelIntent', 'AMAZON.StopIntent', 'AMAZON.NavigateHomeIntent']
        .includes(Alexa.getIntentName(handlerInput.requestEnvelope));
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.speak('終了します。').getResponse();
  }
};

const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
  },
  handle(handlerInput) {
    const speak = 'すみません、わかりませんでした。牛乳を追加して、のように言ってください。';
    return handlerInput.responseBuilder.speak(speak).reprompt(speak).getResponse();
  }
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.getResponse();
  }
};

const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log('スキルエラー:', error && error.stack ? error.stack : error);
    return handlerInput.responseBuilder
      .speak('エラーが発生しました。もう一度お試しください。')
      .getResponse();
  }
};

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    AddItemIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .withCustomUserAgent('otsukai-memo/v1.2')
  .lambda();
