
---

# Scratch CLI（SCC）開発引き継ぎ資料

## 1. プロジェクト概要

### プロジェクト名

**Scratch CLI（SCC）**

- CLIコマンド名：`scc`
- 開発言語：TypeScript / Python
- JavaScriptランタイム：Bun
- CLIフレームワーク：yargs
- Scratch APIライブラリ：Scapi

### プロジェクトの目的

Scratchのさまざまな機能を、Webブラウザを開かずにターミナルから操作・利用できるCLIツールを開発する。

基本的なコンセプトは以下のとおり。

- Scratchアカウントへのログイン・ログアウト
- ログインセッションの管理
- Scratchユーザー情報の取得
- プロジェクトの検索・取得
- スタジオの検索・取得
- 将来的にはScratchのさまざまなAPI操作に対応
- macOSなどで手軽に導入できるCLIとして提供

CLIの使いやすさを重視し、AtCoder CLI（`acc`）のような操作体系も参考にしている。

### CLIの基本設計

コマンド体系は次のような形式とする。

```bash
scc <command> [options]
```

使用例：

```bash
scc
scc help
scc --help

scc login
scc logout
scc session

scc user
scc user -u griffpatch
scc user --user griffpatch

scc python
scc version
```

今後追加したいコマンド：

```bash
scc search project "minecraft"
scc search studio "animation"
```

コマンドのエイリアスも利用できるようにする。

```bash
scc s    # scc session
scc u    # scc user
```

**重要：** `scc u` のようなコマンドエイリアスと、`scc user -u griffpatch` のようなオプションエイリアスは別々に管理する。

---

## 2. 使用技術

### メイン技術

| 技術 | 用途 |
|---|---|
| TypeScript | CLI本体、引数処理、Pythonとの連携 |
| Bun | TypeScript実行、パッケージ管理、CLI実行 |
| yargs | コマンド定義、オプション解析、ヘルプ、補完 |
| Python | Scratch APIへのアクセス |
| Scapi | Scratch APIクライアント |
| aiohttp | Python側のHTTP通信 |
| Node.js標準API | ファイル操作、パス処理など |
| JSON | 設定保存、TypeScript・Python間のデータ交換 |
| zsh | 主な開発用シェル |

### 開発時に確認されたバージョン

| ソフトウェア | 確認されたバージョン |
|---|---|
| Bun | 1.3.14 |
| Scapi | 3.2.3 |
| Python | 3.13 / 3.14.3 / 3.14.6 |
| OS | macOS（Apple Silicon / arm64） |

yargsの正確なインストールバージョンは会話内で確認できていないため、`package.json` を参照すること。

Pythonについては、開発途中で複数のバージョンを試している。現在の仮想環境のバージョンは実際に確認すること。

### 参考ドキュメント

- [Scapi公式ドキュメント](https://scapi.kakeru.f5.si/ja/stable/)
- [Scapi サイトAPIリファレンス](https://scapi.kakeru.f5.si/ja/stable/reference/sites.html)
- [Scapi User](https://scapi.kakeru.f5.si/ja/stable/reference/sites.html#scapi.User)
- [Scapi search_projects](https://scapi.kakeru.f5.si/ja/stable/reference/sites.html#scapi.search_projects)
- [yargs公式リポジトリ](https://github.com/yargs/yargs)
- [yargs APIドキュメント](https://github.com/yargs/yargs/blob/main/docs/api.md)

Scapiのドキュメントは更新されており、2026年10月の確認時点ではstable版のドキュメントが3.2.4を示している。実際にインストールされているライブラリのバージョンとAPIシグネチャを照合すること。[Scapi Documentation](https://scapi.kakeru.f5.si/ja/stable/reference/sites.html?utm_source=chatgpt.com)

---

## 3. 開発環境

### OS・シェル

主な開発環境は以下。

```text
OS: macOS
Architecture: Apple Silicon (arm64)
Shell: zsh
JavaScript Runtime: Bun
Editor: Visual Studio Code
```

### プロジェクトディレクトリ

現在のプロジェクト配置：

```text
/Users/kirameku26/src/scratch-cli
```

省略形：

```bash
~/src/scratch-cli
```

以前は次の場所に存在した。

```text
~/Documents/GitHub/scratch-cli
```

**この旧パスは使用しないこと。**

CLI本体や補完設定に古いパスが残っている場合は、現在のディレクトリに合わせて修正する。

### Bun

CLIのエントリーポイントは、プロジェクトルートの `index.ts`。

先頭にshebangを記述する。

```ts
#!/usr/bin/env bun
```

`package.json` では、少なくとも以下のような実行ファイル定義を使用していた。

```json
{
  "name": "scc",
  "version": "0.1.0",
  "bin": {
    "scc": "./index.ts"
  }
}
```

実際の`package.json`にある他の項目は維持すること。

プロジェクトを移動したことで、過去に `scc: command not found` が発生した。

必要に応じてプロジェクトルートで以下を実行する。

```bash
bun install
bun link
```

確認：

```bash
which scc
scc --help
```

過去には、`scc` が以下の場所に登録されていた。

```text
~/.bun/bin/scc
```

### Python仮想環境

グローバルPythonにScapiをインストールするのではなく、**SCC専用のvenv**を使う。

```text
~/.config/scc/python/.venv
```

Python実行ファイル：

```text
~/.config/scc/python/.venv/bin/python
```

確認コマンド：

```bash
~/.config/scc/python/.venv/bin/python --version
~/.config/scc/python/.venv/bin/python -m pip show scapi
```

Python環境の場所は、`src/python/index.ts` で定義している。

```ts
import { homedir } from "node:os";
import { join } from "node:path";

export const pythonDir = join(
  homedir(),
  ".config",
  "scc",
  "python",
);

export const venvDir = join(
  pythonDir,
  ".venv",
);
```

---

## 4. プロジェクト構成

これまでの会話で確認・作成したファイルをもとにした構成。

```text
scratch-cli/
├── index.ts
├── package.json
├── bun.lock
├── tsconfig.json
├── README.md
│
└── src/
    ├── config.ts
    │
    ├── commands/
    │   ├── index.ts
    │   ├── login.ts
    │   ├── logout.ts
    │   ├── session.ts
    │   ├── python.ts
    │   └── user.ts
    │
    ├── python/
    │   ├── index.ts
    │   ├── venv.ts
    │   ├── scapi.ts
    │   ├── user.ts
    │   ├── user.py
    │   ├── scarch.ts
    │   ├── scarch.py
    │   └── login_test.py
    │
    ├── completion/
    │   ├── _scc
    │   └── generate.ts
    │
    └── help/
        └── index.ts
```

**注意：これは完全に確認済みのファイル一覧ではない。**

特に以下は確認が必要。

- `src/python/scarch.py` と `scarch.ts` は、会話中に確認された実際のファイル名。`search` のスペルミスと思われる。
- `src/completion/generate.ts` は独自補完生成時に作成したもの。現在も使われているかは不明。
- `src/help/index.ts` はyargs移行前の独自ヘルプ実装。不要になっている可能性がある。
- `src/python/login_test.py` はScapiログイン確認用のテスト。
- `src/python/search.py` は作成を試みたが、最終的に存在が確認されたのは `scarch.py`。

Codexは作業前に実際のファイル構成を確認すること。

---

## 5. アーキテクチャ

基本構成は以下。

```text
                  User
                    │
                    ▼
               scc command
                    │
                    ▼
                index.ts
                    │
                    ▼
                  yargs
                    │
                    ▼
          src/commands/index.ts
                    │
             Command handler
                    │
                    ▼
          src/commands/*.ts
                    │
                    ▼
           src/python/*.ts
                    │
                    ▼
               Bun.spawnSync
                    │
                    ▼
          Python virtual environment
                    │
                    ▼
             src/python/*.py
                    │
                    ▼
                  Scapi
                    │
                    ▼
               Scratch API
                    │
                    ▼
               Python JSON
                    │
                    ▼
               TypeScript
                    │
                    ▼
             Terminal output
```

### TypeScriptとPythonの役割

**TypeScript**

- CLIコマンドの登録
- yargsによる引数解析
- オプションの管理
- ヘルプ表示
- コマンドエイリアスの管理
- シェル補完
- 設定ファイルの読み書き
- Python環境の管理
- Pythonプロセスの起動
- Pythonから返されたJSONの解析
- ターミナル向けの表示整形

**Python**

- Scapiを利用したAPIアクセス
- Scratchセッションの復元
- Scratchユーザー情報の取得
- Webサイトからの追加情報取得
- 今後のプロジェクト・スタジオ検索
- API例外の処理
- TypeScriptへ渡すJSONの生成

### プロセス間通信

現在は `Bun.spawnSync()` を使ってPythonを実行している。

```ts
const result = Bun.spawnSync(
  [
    pythonPath,
    scriptPath.pathname,
    // arguments
  ],
  {
    stdout: "pipe",
    stderr: "pipe",
  },
);
```

Pythonから返された結果を次のように扱う。

```ts
const stdout = new TextDecoder()
  .decode(result.stdout)
  .trim();

const stderr = new TextDecoder()
  .decode(result.stderr)
  .trim();
```

基本ルール：

- `stdout`：TypeScriptが解析するJSON
- `stderr`：エラーメッセージやデバッグログ
- 終了コード`0`：成功
- 終了コード`0`以外：失敗

Python側で通常の文章をstdoutに出すと、TypeScriptの `JSON.parse(stdout)` が失敗する。

過去に発生した `Failed to parse Scapi response.` は、この出力形式の不一致が原因だった。

---

## 6. 完成済み・動作確認済みの機能

### 6.1 CLIの基本実行

次のコマンド体系を実装している。

```bash
scc
scc help
scc login
scc logout
scc session
scc python
scc user
scc version
```

yargsを導入し、コマンド定義を一元管理する設計へ移行した。

### 6.2 yargsによるコマンド管理

コマンドは `src/commands/index.ts` で定義する。

型の基本構造は以下。

```ts
export type Option = {
  name: string;
  alias?: string;
  type: "string" | "boolean";
  description: string;
};

export type Command = {
  description: string;
  aliases?: string[];
  options?: Option[];
  handler: (argv: any) => Promise<void>;
};
```

登録例：

```ts
user: {
  description: "show Scratch user information",
  aliases: ["u"],
  options: [
    {
      name: "user",
      alias: "u",
      type: "string",
      description: "show information for a specific user",
    },
  ],
  handler: user,
},
```

この設計により、コマンドとオプションを区別して扱える。

```bash
scc u
```

は `scc user` の別名。

```bash
scc user -u griffpatch
```

は `--user` オプションの短縮形。

### 6.3 ヘルプ・バージョン表示

実装した機能：

```bash
scc
scc help
scc -h
scc --help
scc user --help

scc version
scc -v
scc --version
```

引数なしの `scc` ではヘルプを表示する。

コマンドはABC順に表示することを希望している。

CLIの表示言語は英語に統一する。

```ts
.locale("en")
```

### 6.4 Python環境の検出

```bash
scc python
```

Pythonのインストール状況を確認できる。

動作確認時の出力例：

```text
Python found: Python 3.14.6
```

Python検出処理は `src/python/index.ts` に実装。

### 6.5 Python仮想環境の自動作成

SCC専用のvenvを作成する処理を実装済み。

```text
~/.config/scc/python/.venv
```

実際に作成できることを確認した。

```text
bin
include
lib
pyvenv.cfg
```

関連ファイル：

```text
src/python/index.ts
src/python/venv.ts
```

### 6.6 Scapiの自動インストール・更新確認

Scapiがインストールされていない場合、自動インストールする。

インストール済みの場合は、バージョンを確認する。

現在の処理は次のような構成。

```text
scc python
    │
    ├── Python検出
    │
    ├── venv確認・作成
    │
    ├── Scapiインストール確認
    │
    ├── 未インストールならインストール
    │
    ├── PyPIの最新版確認
    │
    ├── 必要ならアップデート
    │
    └── Scapi ready
```

動作確認済みの出力：

```text
Python found: Python 3.14.6
Virtual environment: /Users/kirameku26/.config/scc/python/.venv
Scapi 3.2.3 is installed.
Scapi is up to date.
Scapi is ready.
```

過去に次のテストも成功した。

1. Scapiをvenvからアンインストールする。
2. `scc python` を実行する。
3. Scapiが自動インストールされる。
4. 再実行するとインストール済みと判定される。

関連ファイル：

```text
src/python/scapi.ts
src/python/venv.ts
src/commands/python.ts
```

今後は、更新確認の頻度やPythonの対応バージョンを管理する仕組みを改善したい。

### 6.7 Scratchログイン

Scratchのアカウントにログインする処理を実装した。

```bash
scc login
```

ログイン時はユーザー名とパスワードを取得する。

基本的な表示：

```text
Username:
Password:
Logging in...
Login successful.
```

パスワードは入力中に表示されないようにする。

また、ログイン済みの場合は、再ログインする前にその状態を表示する機能も検討・実装していた。

ログイン処理にはScratchのHTTPエンドポイントを直接使用する方式を採用していた。

```text
https://scratch.mit.edu/csrf_token/
https://scratch.mit.edu/accounts/login/
```

Scapiの `scapi.login()` も動作確認済み。

`scapi.login()` では正常に `Session` を取得できることを確認した。

### 6.8 Scratchログアウト

```bash
scc logout
```

Scratch側のログアウトAPIへリクエストする。

```text
https://scratch.mit.edu/accounts/logout/
```

成功後、ローカルに保存した認証情報を削除する。

確認された正常な実行結果：

```text
Logging out...
Logout response: 200
Logout request successful.
Session response: 200
Logged out successfully.
```

ログアウト確認処理では、認証Cookieの有無を区別することが重要。

### 6.9 ログイン状態確認

```bash
scc session
```

ログインしているか確認する機能。

以前は `status` や `auth status` も検討していたが、最終的にトップレベルの `session` コマンドへ整理した。

エイリアス：

```bash
scc s
```

### 6.10 Scratchユーザー情報の取得

```bash
scc user
```

ログイン中のユーザーを取得する。

```bash
scc user -u griffpatch
```

指定ユーザーを取得する。

```bash
scc user --user griffpatch
```

も使用可能。

コマンドエイリアス：

```bash
scc u
```

Scapiで利用する主要API：

```python
scapi.session_login(session_id)
```

```python
await session.get_user(username)
```

ユーザーのWebページから追加情報を取得するため、以下も実行する。

```python
await user.load_website()
```

`User.load_website()` は、HTMLからのみ取得できる情報を読み込むメソッドであり、`exist`、`is_scratcher`、`comments_allowed` などの情報取得に関係する。[Scapi Documentation](https://scapi.kakeru.f5.si/ja/stable/reference/sites.html?utm_source=chatgpt.com)

**重要：自分自身のユーザー情報を取得する場合も、`session.get_user()` を使う方針になっている。**

```python
target_username = username or session.username

user = await session.get_user(
    target_username
)

await user.load_website()
```

### 6.11 ユーザーが存在しない場合の処理

存在しないScratchユーザーを検索すると、Scapiの `NotFound` が発生する。

実際に確認した例外：

```text
scapi.utils.error.NotFound
```

Python側では専用の例外を捕まえる。

```python
from scapi.utils.error import NotFound
```

```python
except NotFound:
    print(json.dumps({
        "error": "User not found",
        "username": username,
    }))
    return 1
```

TypeScript側でエラーJSONを解析し、長いtracebackを表示せず、CLI向けのメッセージを表示する。

目標：

```text
User not found: nonexistent_user
```

### 6.12 ZshのTab補完

Tab補完を実装していた。

当初は自作の `_scc` ファイルを使用していたが、後にyargs標準のcompletion機能へ移行した。

```ts
cli.completion("completion");
```

これにより、

```bash
scc completion
```

で補完スクリプトを生成する構成。

コマンドの補完候補はABC順に表示したい。

表示例：

```text
login       -- login to Scratch
logout      -- logout from Scratch
python      -- check Python installation
session     -- check login status
user        -- show Scratch user information
version     -- output the version number
```

コマンドとオプションのエイリアスは区別すること。

zshの補完設定には過去に何度か問題が起きており、現在の設定は再確認が必要。

---

## 7. Scratchユーザー情報の表示仕様

ユーザー情報はScapiから取得し、PythonからJSONとしてTypeScriptへ渡す。

TypeScript側では、JSONをターミナル向けに整形する。

### 表示したい項目

これまでの希望を整理すると、中心となる項目は以下。

| キー | 表示名 |
|---|---|
| `username` | Username |
| `id` | ID |
| `profile_id` | Profile ID |
| `icon_url` | Icon URL |
| `country` | Country |
| `joined_at` | Joined |
| `comments_allowed` | Comments Allowed |
| `exist` | Exist |
| `is_scratcher` | Is Scratcher |
| `classroom_id` | Classroom ID |
| `membership_avatar_badge` | Membership Avatar Badge |
| `membership_label` | Membership Label |
| `bio` | Bio |
| `status` | Status |

一時的な調査では、以下も表示していた。

```text
url
is_myself
scratchteam
```

最終的な表示項目は実際のコードと照合すること。

### BioとStatus

`Bio` と `Status` は複数行の文字列が入るため、特別に表示する。

例：

```text
Username: example
ID: 123456
Country: Japan
Joined: 2020-01-01 00:00:00+00:00
Comments Allowed: true
Exist: true
Is Scratcher: true

Bio:
Scratchでプログラミングをしています。
よろしくお願いします。

Status:
新しいプロジェクトを開発中
```

ただし、**Bioの前に空行を必ず入れる仕様にはしない**。

ユーザーは開発中、Bio・Statusの表示順や空行の位置を調整していた。

文字列の先頭・末尾に余計な改行が存在することもあるため、適切に整形する。

```ts
typeof user.bio === "string"
  ? user.bio.trim()
  : user.bio ?? "N/A"
```

内部の改行は維持すること。

### ScapiのUNKNOWN値

Scapiでは、値が不明な場合に以下のような値を返すことがある。

```text
_Special.UNKNOWN
```

PythonからJSON化した結果、文字列として表示されることがあった。

```json
{
  "is_scratcher": "_Special.UNKNOWN"
}
```

これは `null` や `false` と同じ意味ではない。

値が未取得・不明であることを明確に扱う必要がある。

### プロパティの取得

Scapiの `User` オブジェクトには `@property` が含まれている。

そのため、次のコードでは全情報を取得できない場合がある。

```python
user.__dict__
```

例えば、過去に `icon_url` や `url` が取得できなくなった。

必要な属性を取得する場合は、以下を使用する。

```python
getattr(user, field, None)
```

一時的に公開属性を調査したい場合は、`dir(user)` を使用する。

```python
data = {}

for name in dir(user):
    if name.startswith("_"):
        continue

    try:
        value = getattr(user, name)
    except Exception:
        continue

    if callable(value):
        continue

    data[name] = value
```

過去に `data[name] = value` のインデントが間違っており、最後の1項目だけが表示される問題が発生した。

---

## 8. 設定ファイルと認証情報の管理

### 設定ファイル

```text
~/.config/scc/config.json
```

主に以下の情報を保存する。

```json
{
  "scratchcsrftoken": "<csrf-token>",
  "scratchsessionsid": "<session-id>",
  "x-token": "<x-token>"
}
```

上記は構造を示す例であり、実際の認証情報ではない。

### 設定ファイルの型

```ts
export interface Config {
  scratchcsrftoken?: string;
  scratchsessionsid?: string;
  "x-token"?: string;
}
```

### ファイルパーミッション

設定ディレクトリ：

```text
0700
```

設定ファイル：

```text
0600
```

を使用している。

ログアウト後は、認証情報を削除する。

### ScratchセッションIDの引用符問題

開発中に発生した重要な問題。

ScratchのログインAPIから取得した `scratchsessionsid` に、外側の二重引用符が含まれていた。

例えば：

```text
".eJxV..."
```

そのままScapiに渡すと、`session_login()` が失敗することがあった。

一方、正常に動作するScapiの `session.session_id` には外側の引用符が含まれていなかった。

そのため、Cookieから取得した値の外側の引用符を除去する方法を採用した。

```ts
return match[1].replace(/^"(.*)"$/, "$1");
```

**注意事項：**

- JSONファイル内の `\"` 表記そのものは正常。
- JSONのエスケープ処理と、Cookie値に付いている引用符を混同しない。
- Cookie取得時の外側の引用符だけを必要に応じて処理する。
- 文字列中の引用符を無条件で削除しない。
- セッションIDをデバッグ出力にそのまま表示しない。

最終的には、この正規化をログイン処理側に集約することが望ましい。

---

## 9. 未解決の問題・バグ

### 9.1 プロジェクト検索が動いていない

**現在の開発で最も重要な未完了部分。**

Scratchのプロジェクト・スタジオを検索するコマンドを追加しようとしている。

目標：

```bash
scc search project minecraft
scc search studio animation
```

実装対象ファイルとして以下が存在した。

```text
src/python/scarch.py
src/python/scarch.ts
```

ただし `scarch` はスペルミスと思われる。

最終的には以下に統一したい。

```text
src/python/search.py
src/python/search.ts
src/commands/search.ts
```

### 発生したエラー1

```text
TypeError: search_projects() missing 1 required positional argument: 'query'
```

以前、次のように呼び出していた。

```python
scapi.search_projects(query)
```

しかし、**この呼び出し方では必要な引数が足りない**。

### Scapi検索APIの正しいシグネチャ

公式ドキュメントを確認した結果、次の形式になっている。

```python
scapi.search_projects(
    client,
    query,
    mode="trending",
    language="en",
    limit=None,
    offset=None,
    *,
    session=None,
)
```

同様に：

```python
scapi.search_studios(
    client,
    query,
    mode="trending",
    language="en",
    limit=None,
    offset=None,
    *,
    session=None,
)
```

これらは非同期ジェネレーターを返す。[Scapi Documentation](https://scapi.kakeru.f5.si/ja/stable/reference/sites.html?utm_source=chatgpt.com)

**重要：前の会話では `scapi.search_projects(session, query)` と説明したが、公式シグネチャでは第1引数は `HTTPClient` である。`session` は別のキーワード引数。**

Codexはこの点を修正すること。

まずインストール済みScapiのシグネチャを直接確認する。

```bash
~/.config/scc/python/.venv/bin/python -c \
'import inspect, scapi; print(inspect.signature(scapi.search_projects))'
```

スタジオについても同様に確認する。

```bash
~/.config/scc/python/.venv/bin/python -c \
'import inspect, scapi; print(inspect.signature(scapi.search_studios))'
```

そのうえで、正しい `HTTPClient` の生成方法、ライフサイクル、必要な認証の有無を確認して実装する。

### 発生したエラー2

```text
ValueError: not enough values to unpack (expected 3, got 1)
```

このエラーは、検索処理のテスト中に発生した。

以前のコードで、不正なセッションIDや空文字を `session_login()` に渡していた可能性がある。

ただし、**正確な発生箇所はまだ特定していない**。

Codexは現在の `scarch.py` を確認し、再現テストを行うこと。

認証不要の検索であれば、無理に `session_login()` を使わない設計も検討する。

### 9.2 ScapiのPythonバージョン問題

以前、Python 3.14で以下のエラーが発生した。

```text
AttributeError: '_Special' object has no attribute 'get'
```

エラー箇所：

```python
_user = data.get("user")
self.session.user_id = _user.get("id")
```

当初はPython 3.14との互換性が疑われた。

しかし、その後 `scratchsessionsid` の外側の引用符を除去したところ、Python 3.14でもログイン済みユーザーを取得できた。

確認された結果：

```text
Login successful.
Username: kirameku26
User ID: 60614001
```

**したがって、Python 3.14が非対応であると断定してはいけない。**

現時点では、セッションIDの形式やAPIレスポンスが関係していた可能性が高い。

Scapiの内部ファイルをデバッグ目的で一時編集したこともある。

必要に応じて、Scapiを再インストールしてパッケージを正常な状態に戻すこと。

### 9.3 シェル補完の更新

過去に次の問題が発生した。

- `_scc not found`
- 古い補完関数が使われる
- 補完候補がABC順にならない
- コマンドエイリアスの表示が希望と異なる
- `-u` / `--user` が補完されない
- プロジェクト移動後に古いパスが残る
- `fpath` に同じディレクトリが複数登録される

現在はyargs標準completionへの移行を進めている。

ただし、独自の `_scc` が残っている可能性がある。

yargs公式ドキュメントでは、Zsh向けの生成スクリプトは `_scc_yargs_completions` のような名前で補完ディレクトリに設置する方式が説明されている。独自の `_scc` 方式と混在させないこと。[GitHub](https://github.com/yargs/yargs/blob/main/docs/api.md?utm_source=chatgpt.com)

Codexは現在有効な補完スクリプトと `.zshrc` を調査し、方式を統一すること。

### 9.4 ヘルプの文字色

次のコマンドで、表示内容は同じなのに色が異なる問題があった。

```bash
scc
```

```bash
scc --help
```

原因として、`cli.showHelp()` の出力方法が関係していた。

最終的には、引数なしの場合に `--help` をyargsへ渡す方式を採用した。

```ts
const args = hideBin(process.argv);

const cli = yargs(
  args.length === 0 ? ["--help"] : args,
);
```

これによって、通常の `--help` と同じ処理経路を使用する。

**注意：**

```ts
cli.help()
```

はヘルプ文字列ではなく、yargsインスタンスを返す。

また、利用していたyargsには次のメソッドがなかった。

```ts
.color(false)
```

実際にTypeErrorが発生したため、使用しないこと。

### 9.5 Python・TypeScriptのエラー処理

PythonからエラーJSONが返されても、TypeScript側が正常に読み取れず、次の表示になることがあった。

```text
Failed to get user information.
```

原因は、終了コードが非0のときにstdout内のJSONを解析していなかったこと。

現在は、Pythonでエラーが発生した場合もJSONを返し、TypeScript側でそれを解析する構成。

今後はさらに、エラーの種類と終了コードを統一したい。

### 9.6 セッションIDの安全な受け渡し

現在はPythonの起動引数としてセッションIDを渡している。

```ts
const pythonArgs = [
  pythonPath,
  scriptPath.pathname,
  config.scratchsessionsid,
];
```

ただし、コマンドライン引数はプロセス情報として参照できる場合がある。

将来的には、**stdinを使ってJSONで安全に渡す設計**も検討したい。

---

## 10. 今後実装したい機能

### 優先度1：プロジェクト検索

目標：

```bash
scc search project minecraft
```

必要な機能：

- キーワード検索
- 検索結果の取得
- プロジェクトID
- プロジェクト名
- 作成者
- プロジェクトURL
- 検索件数制限
- エラー処理

将来的には以下のオプションも追加したい。

```bash
scc search project minecraft --limit 20
scc search project minecraft --offset 20
```

Scapiの `search_projects()` を利用する。

### 優先度2：スタジオ検索

目標：

```bash
scc search studio animation
```

Scapiの `search_studios()` を利用する。

プロジェクト検索と共通の処理を再利用したい。

### 優先度3：検索結果の整形

最初はJSONとして結果を取得し、実際に含まれるフィールドを確認する。

その後、CLI向けに整形する。

例：

```text
Search results for "minecraft"

1. Minecraft Example
   ID: 123456
   Author: example
   URL: https://scratch.mit.edu/projects/123456/

2. Minecraft Tutorial
   ID: 234567
   Author: example2
   URL: https://scratch.mit.edu/projects/234567/
```

実際の表示項目はScapiの取得結果を確認して決める。

### 優先度4：JSON出力オプション

通常は人間向けのテキスト表示を使用する。

```bash
scc user
```

必要に応じて機械処理用のJSONを出力する。

```bash
scc user --json
```

検索コマンドでも同様に使用できるようにしたい。

```bash
scc search project minecraft --json
```

### 優先度5：Python環境管理の改善

現在の自動セットアップ機能を改善する。

検討事項：

- Python対応バージョンの判定
- Pythonが存在しない場合の対応
- venv作成の再実行を減らす
- Scapiの更新確認頻度を制限する
- 必要なコマンド実行時に環境を自動準備する
- セットアップ専用コマンドの導入
- pipの更新が必要かどうかの判断

Python自体がインストールされていない環境への対応は未完成。

### 優先度6：機能の拡張

将来的には、Scapiが提供するAPIを活用して以下のような機能も検討したい。

- プロジェクト情報の取得
- スタジオ情報の取得
- ユーザーが作成したプロジェクト一覧
- ユーザーが参加しているスタジオ一覧
- フォロワー・フォロー情報の取得
- プロジェクトの統計情報
- Scratchの各種公開情報の取得

これらは今後の候補であり、現時点で実装済みという意味ではない。

---

## 11. 開発時の重要なルール

### 11.1 CLIの表示言語

**CLIの表示は英語に統一する。**

対象：

- ヘルプ
- オプション説明
- エラーメッセージ
- 成功メッセージ
- バージョン表示
- セットアップメッセージ

日本語で説明することは問題ないが、CLI自体は英語を使用する。

### 11.2 CLIの機能定義は一元管理する

原則として、`src/commands/index.ts` を中心にコマンドを管理する。

同じコマンド名やオプションを複数の場所に重複定義しない。

yargsに引数解析・ヘルプ・補完を担当させる。

### 11.3 自作の引数パーサーを増やさない

以前は次のようなコードを使っていた。

```ts
if (args[0] === "-u" || args[0] === "--user") {
  username = args[1];
}
```

現在はyargsを導入しているため、基本的には解析済みのargvを使用する。

```ts
export async function user(argv: {
  user?: string;
}) {
  await getUser(argv);
}
```

### 11.4 PythonとTypeScriptの責務を分離する

Pythonはデータを取得してJSONを返す。

TypeScriptはそのJSONを解析してCLI向けに表示する。

Python側にターミナル表示のロジックを大量に入れない。

### 11.5 認証情報を漏らさない

以下は機密情報として扱う。

```text
scratchsessionsid
scratchcsrftoken
x-token
Scratch password
```

これらを次の場所に出力・保存しないこと。

- 通常のCLI出力
- デバッグログ
- Gitリポジトリ
- READMEの使用例
- テスト用スナップショット

`config.json` をGit管理しない。

パスワードは可能な限り対話入力で取得し、コマンドライン引数での受け渡しを避ける。

### 11.6 エラーを適切に扱う

Python側で予期される例外を捕まえる。

例：

```python
except NotFound:
    ...
```

TypeScript側では、通常のユーザー向けエラーと予期しない内部エラーを区別する。

失敗時に終了コード`0`を返して成功扱いにしない。

### 11.7 ScapiのAPIを推測しない

Scapiは標準Pythonライブラリではなく、バージョンによってAPIが異なる可能性がある。

関数名・引数・戻り値が不明な場合は、公式ドキュメントや実際のインストール済みパッケージを確認する。

特に以下は重要。

```python
scapi.search_projects
scapi.search_studios
scapi.session_login
scapi.Session.get_user
scapi.User.load_website
```

### 11.8 小さなステップで開発する

これまでの開発では、次のように段階的に進めてきた。

```text
Step 1: Python検出
Step 2: venv作成
Step 3: Scapiインストール・更新確認
Step 4: Scapi実行
Step 5: ユーザー情報取得
Step 6: CLIオプション対応
Step 7: 検索機能
```

新機能も同様に、小さく動作確認しながら実装する。

ただし、Codexには複数ファイルにまたがる変更をまとめて依頼してもよい。

---

## 12. Codexが最初に確認すべきこと

Codexは新しい実装を始める前に、現在のリポジトリを確認すること。

### 12.1 ディレクトリ構成

```bash
cd ~/src/scratch-cli

find . -maxdepth 4 \
  -not -path './node_modules/*' \
  -not -path './.git/*' \
  -type f
```

### 12.2 Gitの状態

```bash
git status
git branch --show-current
git log -5 --oneline
```

既存の未コミット変更を勝手に破棄しないこと。

### 12.3 BunとPython

```bash
bun --version

~/.config/scc/python/.venv/bin/python --version
~/.config/scc/python/.venv/bin/python -m pip show scapi
```

### 12.4 CLIの動作

```bash
scc
scc --help
scc --version

scc python
scc session
scc user
```

ログイン状態がない場合は、`scc user` が失敗すること自体は正常。

### 12.5 yargsの設定

次のファイルを確認する。

```text
index.ts
src/commands/index.ts
```

特に：

- コマンドエイリアス
- オプションエイリアス
- `--help`
- `--version`
- コマンドのソート
- completion
- `parseAsync()`

### 12.6 TypeScriptとPythonの連携

次を確認する。

```text
src/commands/user.ts
src/python/user.ts
src/python/user.py
```

とくに関数名とimport名が一致しているか確認すること。

過去に、export名の不一致によるエラーが何度も発生した。

### 12.7 検索処理

現在最も確認が必要なファイル：

```text
src/python/scarch.py
src/python/scarch.ts
```

実際に存在するファイルと内容を確認し、検索機能の作業を引き継ぐこと。

---

## 13. 開発再開時の最優先タスク

**次に行う作業は、Scapiを使ったScratchプロジェクト検索機能の完成。**

現在の状況：

```text
Python検出                 完了
venv作成                   完了
Scapiインストール           完了
Scapi更新確認               完了
Scratchログイン             動作確認済み
Scratchログアウト           動作確認済み
セッション管理               実装済み
ユーザー情報取得             動作確認済み
yargs導入                   完了
コマンドエイリアス           実装済み
Tab補完                    実装済み・設定要確認
プロジェクト検索             未完成
スタジオ検索                 未完成
```

### 次の作業手順

1. 既存の `scarch.py` / `scarch.ts` を確認する。
2. Scapiの `search_projects()` のシグネチャを確認する。
3. 正しい `HTTPClient` を渡してプロジェクト検索を実行する。
4. 検索結果が返ることを確認する。
5. 検索結果を単一のJSONとしてTypeScriptへ渡す。
6. `scc search project <query>` を実装する。
7. `search_studios()` に拡張する。
8. yargsのヘルプ・オプション・Tab補完へ反映する。

検索では件数制限を設けること。非同期ジェネレーターの結果を無制限に列挙する実装は避ける。

---

## 14. Codexへの作業指示

このプロジェクトについて、Codexには以下の方針で作業してほしい。

> このプロジェクトは、TypeScript・Bun・yargs・Python・Scapiを利用して開発しているScratch CLI（SCC）です。
>
> これまでChatGPTとの会話で段階的に開発してきました。
>
> まず実際のリポジトリを確認し、この資料と現在のコードの差分を把握してください。
>
> 既存の機能は可能な限り維持してください。特に、ログイン・ログアウト・ユーザー情報取得・Python環境の自動セットアップを壊さないようにしてください。
>
> TypeScript側ではyargsを使用し、Python側ではScapiを使用します。
>
> PythonとTypeScriptの間では、原則としてJSON形式でデータを受け渡します。
>
> CLIのヘルプ、エラー、成功メッセージは英語に統一してください。
>
> ユーザーが指定していない大規模なリファクタリングは避け、必要な変更を中心に実装してください。
>
> 直近の目標は `scc search project <query>` と `scc search studio <query>` を動作させることです。
>
> ScapiのAPIは推測で使用せず、公式ドキュメントと実際のインストール済みバージョンを確認してください。
>
> 変更後は動作確認を行い、変更したファイルとテスト結果を報告してください。

---

## 15. 引き継ぎ時点のまとめ

Scratch CLIは、**認証・ユーザー情報取得・Python実行環境の自動管理・CLI基盤まで開発が進んでいるプロジェクト**です。

特に重要な設計上の決定は以下のとおりです。

| 項目 | 方針 |
|---|---|
| CLIランタイム | Bun |
| メイン言語 | TypeScript |
| CLIフレームワーク | yargs |
| Scratch API | Scapi（Python） |
| Python実行環境 | SCC専用venv |
| データ交換 | JSON |
| 設定保存 | `~/.config/scc/config.json` |
| CLI言語 | 英語 |
| ユーザー取得 | `Session.get_user()` |
| 追加プロフィール取得 | `User.load_website()` |
| ヘルプ | yargs |
| コマンドエイリアス | yargs |
| Tab補完 | yargs completion |
| 次の実装対象 | プロジェクト・スタジオ検索 |

**最も重要なことは、これまで正常に動作した機能を維持しながら、検索機能から開発を再開することです。**

---