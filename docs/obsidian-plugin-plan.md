# Obsidian プラグイン化方針

この文書は、Electron/React 版 Tasklane を Obsidian プラグインとして移植するための作業方針です。

## ブランチの位置づけ

- `develop`: Electron/React 版 Tasklane のメイン機能開発ブランチ
- `feature/obsidian`: Tasklane の Obsidian プラグイン化対応ブランチ

## 目指す姿

Obsidian プラグイン版 Tasklane は、独立したタスク管理アプリではなく、Vault 内の Markdown タスクを一覧とガントチャートで可視化するビューとして実装します。

ノート本文の編集は Obsidian 標準エディタに任せ、Tasklane 側はタスクの抽出、可視化、軽量操作、ノート作成に集中します。

## 管理対象

Tasklane の一覧に表示する対象は次の 2 種類です。

1. frontmatter に `tasklane: true` を持つ Markdown ノート
2. `#task` タグを含むチェックリスト行

frontmatter が `tasklane: hidden` のノートは、Vault には残しますが Tasklane の一覧から除外します。

行タスクは frontmatter を持てないため、`#tasklane/hidden` タグを含む行を一覧から除外します。

```yaml
---
tasklane: true
status: todo
start: 2026-05-18
end: 2026-05-20
progress: 0
tags:
  - task
dependsOn: []
---
```

```yaml
---
tasklane: hidden
---
```

## Tasks プラグイン連携方針

`#task` を含むチェックリスト行は、Obsidian Tasks プラグインの記法と共存できるようにします。

初期対応では次を読み取ります。

- チェック状態
- タスク名
- `#task` とその他タグ
- `YYYY-MM-DD` 形式の日付
- Tasks プラグインで使われる due date の `📅 YYYY-MM-DD`

将来的な拡張候補です。

- priority
- scheduled date
- start date
- done date
- recurrence
- Tasks プラグインの query block との連携

## 削除仕様

プラグイン上でタスクを削除しても、Markdown ファイルは削除しません。

- `tasklane: true` ノートを削除した場合は `tasklane: hidden` に変更する
- `#task` 行を削除した場合は行を消さず、`#tasklane/hidden` を付与する

この仕様により、Tasklane 上の削除は「一覧から外す」操作に留めます。

## クリック仕様

Electron 版ではタスククリックで詳細モーダルを開いていましたが、Obsidian プラグイン版では Obsidian のノートを開くことを基本動作にします。

- ノートタスクをクリックすると対象ノートを開く
- 行タスクをクリックすると対象ノートを開き、対象行へ移動する
- 既存の詳細プロパティは frontmatter を正とする
- 既存の Notes 欄は Obsidian ノート本文に置き換える

## 新規タスク作成

プラグイン側からタスクを追加した場合は、現在の Electron 版と同様に Markdown ノートを作成します。

初期状態では次のような frontmatter を持つノートを作成します。

```yaml
---
tasklane: true
uid: "20260518123045"
status: todo
start: 2026-05-18
end: 2026-05-20
progress: 0
tags:
  - task
dependsOn: []
---

# 新規タスク
```

保存先、ファイル名ルール、既定タグはプラグイン設定として扱います。

## データ保存

タスク本体は Vault 内の Markdown を正とします。

プラグイン固有の UI 設定のみ、Obsidian の `loadData` / `saveData` で保存します。

保存する設定候補です。

- タスクノート保存先
- ファイル名ルール
- 既定タグ
- タグ色
- ソート順
- フィルタ状態
- ガント表示設定

## Electron 版から置き換えるもの

- `localStorage` によるタスク本体保存は廃止する
- `desktopApi` / Electron IPC は Obsidian API に置き換える
- Vault 選択 UI は廃止する
- Markdown ライブエディタは Obsidian 標準エディタに任せる
- 詳細モーダルは初期移植では廃止し、ノートを開く動作へ置き換える

## 実装マイルストーン

1. Obsidian プラグイン scaffold を追加する
2. Tasklane ビューを開けるようにする
3. Vault 内の `tasklane: true` ノートと `#task` 行をスキャンして一覧表示する
4. タスククリックで対象ノート、または対象行を開く
5. プラグインから新規タスクノートを作成する
6. 一覧から外す操作を `tasklane: hidden` / `#tasklane/hidden` として実装する
7. 既存 React UI の一覧とガントチャートを段階的に移植する
8. タグ、ソート、フィルタ、依存関係、進捗線をプラグイン版へ移す
