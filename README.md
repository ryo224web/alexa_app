# Alexa → Notion 買い物リスト（カスタムスキル）

Echo に「アレクサ、おつかいメモで牛乳を追加して」と話すと、Notion の買い物リスト DB に1品1行で追加する Alexa-hosted（Node.js）カスタムスキル。

## ファイル構成

| パス | 内容 | 貼り付け先 |
|---|---|---|
| `skill-package/interactionModels/custom/ja-JP.json` | 対話モデル（フル版） | 開発者コンソール → ビルド → JSONエディター |
| `skill-package/interactionModels/custom/ja-JP.minimal.json` | 切り分け用の最小構成 | 同上（ビルド失敗の原因切り分け時のみ） |
| `lambda/index.js` | スキル本体 v1.2 | コードエディタ → `lambda/index.js` |
| `lambda/config.example.js` | 設定ひな形 | コードエディタで `lambda/config.js` として作成し、トークンを貼る |
| `lambda/package.json` | 依存パッケージ | Alexa-hosted の既定のままで可 |

`lambda/config.js`（トークン入り）は `.gitignore` 済み。**絶対にコミットしない。**

## 引き継ぎメモ

経緯・決定事項・テスト結果・次の一手は [HANDOFF.md](HANDOFF.md) を参照。
