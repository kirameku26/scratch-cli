# scratch-cli

Scratchの情報の閲覧や、プロジェクト・スタジオ・アカウントの操作をコマンドラインから行うCLIツールです。

[English README](README.md)

## はじめに

実行にはBunを使用します。Scratchの情報取得や操作の多くには、PythonとScapiも必要です。
リポジトリのルートで、依存関係のインストール、ヘルプの表示、専用Python環境のセットアップを行えます。

```bash
bun install
bun index.ts --help
bun index.ts python
```

Python環境の作成やScapiのインストール・更新では、対象の保存先と変更内容を確認してから承認してください。

以下の例ではコマンド名を `scc` としています。ソースから実行する場合は、`scc` を `bun index.ts` に置き換えてください。
CLIのヘルプやエラーメッセージ、確認メッセージは英語で表示されます。

## コマンドの探し方

```bash
scc                             # コマンドを用途別に表示
scc help project                # プロジェクトの操作・オプション・実行例を表示
scc help studio
scc help project edit           # editの詳細だけを表示
scc project edit --help         # 同じ詳細ヘルプを表示
scc help user reply
scc login --username your_name
scc user                        # ログイン中のユーザーを表示
scc project list                # 自分の作品一覧を表示
scc logout
```

| 用途 | コマンド |
| --- | --- |
| ログイン・アカウント設定 | `login`、`logout`、`session`、`account` |
| Scratchの情報を閲覧 | `home`、`search`、`explore`、`user`、`forum`、`legal` |
| プロジェクト・スタジオ | `project`、`studio` |
| メッセージ | `notifications`（別名：`messages`） |
| 教師用クラス管理 | `class` |
| セットアップ・補助機能 | `python`、`completion`、`version`、`help` |

詳しい使い方は `scc <command> --help` または `scc help <command>` で確認できます。
引数なしの `project`、`studio`、`class`、`forum` もヘルプを表示します。

プロジェクト・スタジオ・クラスの操作は `<action> [id]`、ユーザーの操作は `[username] [action]` の形式です。
ユーザー情報の表示内容は `--section` で選択します。
`account` はログイン中のアカウントの設定変更、`user` はプロフィールの閲覧やユーザーへの操作に使用します。

`project`、`studio`、`user`、`account`、`class`、`forum`、`notifications` は、`scc help <command> <action>` で操作ごとの説明・必須引数・対応オプション・ログインや確認の要否・実行例を表示できます。
通常の操作構文の末尾に `--help` または `-h` を付けても同じ内容を表示します。
例えば `scc user griffpatch reply --help` は返信を投稿せず、返信のヘルプだけを表示します。

## ログイン・ログアウトと通信エラー

```bash
scc login --username your_name
scc session                     # 保存済みセッションの認証状態を確認
scc logout
scc logout --local              # 通信せず、CLIの保存済みログインだけを削除
```

ログイン時のパスワードは対話端末で入力します。画面には表示されず、コマンドライン引数では指定しません。

`scc logout` はScratchにログアウト要求を送り、応答でログアウトを確認してからCLIの保存済みログインを削除します。
Scratchに接続できない場合は、`scc logout --local` で通信せずCLIの保存済みログインだけを削除できます。
これらのコマンドは、ブラウザーのログアウトや、コピー済みのすべてのセッショントークンの無効化を保証するものではありません。

通信失敗・レート制限・不正な応答は、未ログインではなくエラーとして扱います。
認証用の通信は15秒、Scapi経由の操作は30秒でタイムアウトします。Pythonプロセスの待機上限は35秒です。
失敗した要求を自動で再試行することはありません。
変更操作がタイムアウトした場合は、Scratch側では完了している可能性があるため、結果を確認してから再実行してください。

## ユーザー・プロフィール・公開一覧

ユーザー情報は `scc user` で表示します。ユーザー名を省略すると、ログイン中のアカウントを使用します。
既定の `details` セクションにはログインが必要です。
公開セクションは、ユーザー名を指定すればログインせずに閲覧できます。

```bash
scc user
scc user griffpatch
scc user griffpatch --section about
scc user --list
scc user griffpatch --section projects
scc user griffpatch --section favorites --limit 20 --offset 20
scc user griffpatch --section studios
scc user griffpatch --section followed-studios
scc user griffpatch --section following
scc user griffpatch --section followers
scc user griffpatch --section comments --page 2
```

| セクション | 表示内容 |
| --- | --- |
| `details` | ユーザーの詳細情報（既定・ログイン必須） |
| `about` | プロフィール概要、「私について」「私が取り組んでいること」 |
| `projects` | 共有している作品 |
| `favorites` | お気に入りの作品 |
| `studios` | キュレーターとして参加しているスタジオ |
| `followed-studios` | フォローしているスタジオ |
| `following` | フォローしているユーザー |
| `followers` | フォロワー |
| `comments` | プロフィールのコメント |

`details` と `about` は、注目のプロジェクト、そのユーザーが設定した見出し、最近の活動を最大10件表示します。
ログイン中は、対象ユーザーをフォローしているかを `Yes`・`No`・`Unknown` で表示します。自分のプロフィールも `Self` ではなく同じ形式です。
本人ページにフォローボタンがない場合は、フォロー一覧の先頭1ページ（最大40人）を確認します。
一覧が40人に達し、その中に自分が見つからない場合など、状態を確定できなければ `Unknown` と表示します。

一覧の `--limit` は1～40件（既定：10件）、`--offset` は取得開始位置（既定：0）です。
コメントでは代わりに `--page`（既定：1）を使用します。
これらの情報表示コマンドは、Scratch上のデータを変更しません。

自分の情報は `scc user`、プロフィールは `scc user <username> --section about`、アカウントの変更は `scc account <action>` を使用してください。従来の引数なしの `scc account`、`scc profile`、`scc user --user` / `-u` は利用できません。

## プロジェクトの閲覧・操作

`details` はプロジェクトのタイトル、リミックス元、使い方、メモとクレジット、好き・お気に入り・閲覧・リミックス数などを表示します。
My Stuffの一覧や変更操作には、ログイン中のアカウントを使用します。

```bash
scc project details 123
scc project comments 123 --limit 20 --offset 0
scc project remixes 123
scc project studios 123
scc project reactions 123
scc project list --visibility all
scc project list --visibility shared --page 2
scc project list --visibility notshared
scc project list --visibility trashed
scc project create --title "新しい作品"
scc project remix 123 --title "自分のリミックス"
scc project share 123
scc project unshare 123
scc project settings 123 --comments off
scc project settings 123 --comments on
scc project trash 123
scc project restore 123
scc project edit 123 --title "新しいタイトル" --instructions "遊び方" --credits "ありがとう！"
scc project thumbnail 123 --file thumbnail.png
scc project download 123 --output project.sb3
scc project upload --file project.sb3 --title "新しい作品"
scc project upload 123 --file project.sb3
scc project love 123
scc project unlove 123
scc project favorite 123
scc project unfavorite 123
scc project comment 123 --text "すてきな作品ですね！"
scc project reply 123 --comment-id 456 --text "ありがとうございます！"
scc project report 123 --category 6 --reason "報告する理由"
scc project report-comment 123 --comment-id 456
```

`--visibility` は `all`（すべて）・`shared`（共有済み）・`notshared`（未共有）・`trashed`（ゴミ箱）から選択します。
`trash` はゴミ箱への移動、`restore` はゴミ箱からの復元です。
サムネイルには1バイト以上・5 MiB以下のPNG・JPEG・GIF画像を使用できます。

`download` は画像・音声を含む作品を、既定で `.sb3` として保存します。Scratch 1/2形式のデータは、スクリプトを実行せずオフラインで変換します。`--format original` は元の形式を保持し、`--format sb|sb2|sb3` で出力形式を選べます。Scratch 1→2/3、2→3の変換に対応し、古い形式への逆変換は未対応です。既定ファイル名はサイト上の作品名と出力形式の拡張子で、`--output` の指定があればそちらを優先しますが、`.sb`・`.sb2`・`.sb3` の拡張子は選択した形式に合わせてください。ファイル名に使えない文字は置き換え、長すぎる作品名は短縮します。作品名が空や取得不能の場合はIDを使います。親ディレクトリはあらかじめ作成してください。保存済みログインがあれば使用し、自分の未共有作品も取得できます。既存ファイルの置き換えには対話確認が必要で、シンボリックリンクを保存先にはできません。

```bash
scc project download 600                    # sb3へ変換（既定）
scc project download 600 --format original  # 元の.sbを保持
scc project download 600 --format sb2       # Scratch 1→2へ変換
```

未対応のブロック・拡張機能が失われる場合は、黙って保存せず変換を中止します。SVGの表示は旧エディターと異なることがあるため、元のデータが必要な場合は `original` を使ってください。形式変換の制限時間は、通信とは別に120秒です。

`upload` はID省略時に未共有の新規作品を作成し、ID指定時には確認したアカウントが所有する作品のコード・画像・音声を置き換えます。既存作品のタイトルと共有状態は変更しません。アップロードは常に対話確認が必要で、上書き時は `overwrite <id>` を入力します。CLIからは取り消せないため、先にバックアップしてください。`--title` は新規作成時のみ指定できます。

アップロードは `.sb3` のみ、ダウンロードは `.sb`・`.sb2`・`.sb3` に対応します。ファイル50 MiB、展開後100 MiB、重複を除くアセット200個、アセット1個10 MiB、project.json 5 MiBを上限とします。通信の制限時間は120秒です。アセットは順番に転送し、自動再試行しません。アップロードが中断・失敗した場合も、一部アセットや作品の変更が保存されている可能性があるため、Scratchで状態を確認してから再実行してください。

`comments` は親コメントの本文・作者・IDを表示し、返信は自動取得しません。
`remixes` はリミックス作品の一覧で、廃止されたリミックスツリーは使用しません。
`studios` はその作品が追加されているスタジオの一覧です。これらはログイン不要で、`--limit`（1～40件、既定：20件）と `--offset`（既定：0）を指定できます。
`reactions` はログイン中のアカウントが、その作品に好き・お気に入りを付けているかを表示します。状態を読むだけなので実行確認はありません。

### offset方式の一覧をページで指定する

`--offset` に対応する一覧は、1始まりの `--page`（既定：1）でも取得位置を指定できます。開始位置は `offset + (page - 1) × limit` です。`--limit 10 --page 2` は10件、さらに `--offset 5` を指定すると15件ずらします。検索・Explore・ホーム・ユーザーの公開一覧・作品のcomments/remixes/studios・スタジオのprojects・通知一覧が対象で、前のページを巡回せず指定範囲だけを取得します。

```bash
scc search project "game" --limit 10 --page 2
scc user griffpatch --section projects --limit 20 --page 3
scc project comments 123 --limit 20 --page 2
```

通知で `--limit` を省略すると、未読数（最大40件）がページの大きさになります。固定件数で移動したい場合は `--limit` を指定してください。ユーザーコメント、My Stuff、スタジオ一覧、クラス、フォーラムなどAPI固有のページ方式は従来どおりです。offset非対応のスタジオactivityには `--page` を指定できません。
`share` の反対が `unshare`（共有解除）です。

## ユーザーへの操作

```bash
scc user griffpatch follow
scc user griffpatch unfollow
scc user griffpatch comment --text "こんにちは！"
scc user griffpatch reply --comment-id 456 --text "返信です！"
scc user griffpatch report-comment --comment-id 456
scc user griffpatch delete-comment --comment-id 456
scc user griffpatch report --report-type icon
```

フォローや投稿にはログイン中のアカウントを使用します。
コメントは公開されます。本文は1～500文字で指定してください。
返信の `--comment-id` には、対象の作品・ユーザー・スタジオにある返信先の親コメントIDを指定します。
操作が成功した場合は、使用したアカウントを表示します。
セッション認証情報を子プロセスのコマンドライン引数に含めることはありません。

## スタジオの閲覧・管理

```bash
scc studio details 123
scc studio projects 123 --limit 20 --offset 0
scc studio activity 123 --limit 20
scc studio role 123
scc studio settings 123 --comments off
scc studio settings 123 --open-to-all on
scc studio list --type owned
scc studio create
scc studio accept-invite 123
scc studio edit 123 --title "新しいタイトル" --description "新しい説明"
scc studio thumbnail 123 --file thumbnail.png
scc studio add-project 123 --project https://scratch.mit.edu/projects/456/
scc studio remove-project 123 --project 456
scc studio follow 123
scc studio invite 123 --user curator_name
scc studio remove-curator 123 --user curator_name
scc studio promote 123 --user curator_name
scc studio transfer 123 --user new_owner
scc studio managers 123
scc studio curators 123
scc studio comments 123
scc studio comment 123 --text "ようこそ！"
scc studio report 123 --report-type title
scc studio delete 123
```

`details` は公開情報を表示します。一覧や変更操作にはログイン中のアカウントを使用します。
作品の追加・削除は、作品IDまたはScratchの作品URLで指定できます。
操作によっては、スタジオの所有者・マネージャーなどの権限が必要です。

`projects` はスタジオ内の作品、`activity` は最近の活動を表示します。いずれもログイン不要で、`--limit`（1～40件、既定：20件）を指定できます。
`projects` は `--offset`（既定：0）にも対応しますが、`activity` には指定できません。
`role` はログイン中のアカウントのマネージャー・キュレーター・招待・フォロー状態を表示します。権限そのものを変更するコマンドではありません。

## プロフィール・アカウント設定

`account` は、ログイン中のアカウントの設定変更に使用します。

```bash
scc account edit-profile --about "こんにちは！" --working-on "ゲームを制作中"
scc account edit-profile --featured-project 123
scc account settings --country Japan --state Tokyo
scc account settings --cat-ears on
scc account settings --comments off
scc account settings --comments on
scc account scratcher-status
scc account become-scratcher
scc account change-email --email new@example.com
scc account change-password
scc account delete-account
scc account delete-account --delete-projects
```

`scratcher-status` はScratcherへの招待状態を取得し、`become-scratcher` は招待を受け入れます。
`settings --cat-ears on` / `off` で猫耳アバター装飾の表示を切り替えます。
パスワードが必要な操作では、コマンドライン引数ではなく非表示の対話入力を使用します。

## 教師用クラス管理

Scratchの教師アカウントで、クラス・生徒・クラススタジオを管理できます。
一覧は指定した1ページだけを取得します。

```bash
scc class list --type all --page 1
scc class details 123
scc class students 123 --page 1
scc class studios 123 --page 1
scc class create --title "自分のクラス"
scc class edit 123 --status "ゲームを制作中"
scc class edit 123 --open off
scc class create-studio 123 --title "クラスの作品"
```

## コメント・作品追加権限の切り替え

| 対象 | 設定コマンド | 状態の確認 |
| --- | --- | --- |
| 作品のコメント | `scc project settings 123 --comments on` / `off` | `scc project details 123` |
| スタジオのコメント | `scc studio settings 123 --comments on` / `off` | `scc studio details 123` |
| 誰でもスタジオに作品を追加できるか | `scc studio settings 123 --open-to-all on` / `off` | `scc studio details 123` |
| 自分のプロフィールのコメント | `scc account settings --comments on` / `off` | `scc user` |

`on` は許可、`off` は不許可です。表の `/ off` はオプション値を `off` に置き換える意味で、文字どおり入力するものではありません。
スタジオの設定は1項目ずつ変更します。アカウントの `--comments` は国・地域・猫耳の設定と同時には指定できません。
どの変更にも対象アカウントを示した確認が必要です。

単純に反転するAPIを使う設定では、現在の状態を読み、すでに指定どおりなら変更しません。状態が不明なら中止し、変更した場合は結果を確認します。
結果を確認できなかった場合はエラーになり、自動再試行しません。エラーでもScratch側では変更済みの可能性があるため、状態を確認してから再実行してください。

## 変更操作の確認と安全上の注意

作成・リミックス・招待承認・コメント投稿・好き・お気に入り・フォローとその解除など、Scratch上の変更操作には対話確認が必要です。
使用するアカウントと、対象・変更内容を確認してから、表示された指示に従って入力してください。
通常は `yes` の入力を要求します。公開コメントは投稿前に本文も表示します。
確認後にアカウントが切り替わった場合は、変更を中止します。

影響の大きい操作では、通常の `yes` ではなく、対象を含む専用の確認文字列を要求します。

| 操作 | 確認時に入力する文字列 |
| --- | --- |
| アカウント削除 | `delete <account>` |
| パスワード変更 | `change-password <account>` |
| スタジオ所有権の移譲 | `transfer <id> to <username>` |
| クラスの閉鎖 | `close class <id>` |

上表の `<account>` などは、実際に表示されたアカウント名やIDに置き換えます。
アカウント削除・パスワード変更・所有権移譲では、確認後に必要なパスワードを非表示で読み取ります。
パスワード変更が成功するとCLIの保存済みログインを削除するため、再ログインしてください。

確認を省略するオプションはありません。非対話環境では変更操作を実行せずに中止します。
報告やアカウント削除は、本当に必要な場合にだけ実行してください。
専用Python環境の作成とScapiのインストール・更新にも、対象パスを示した別の確認が必要です。

## フォーラム

```bash
scc forum                       # 通信せず、フォーラムのヘルプを表示
scc forum categories            # カテゴリとIDの一覧
scc forum topics 18 --page 1     # カテゴリ18のトピック一覧
scc forum topic 123              # トピックの情報
scc forum posts 123 --page 2     # トピックの指定ページの投稿を読む
scc forum post 456               # 投稿を1件読む
scc forum source 456             # 投稿のBBCodeを表示
scc forum follow 123             # トピックをフォロー（ログイン・確認必須）
scc forum unfollow 123           # フォロー解除（ログイン・確認必須）
scc help forum posts
```

閲覧はログイン不要で、保存済みの認証情報を使用しません。
`topics` にはカテゴリID、`topic`・`posts`・`follow`・`unfollow` にはトピックID、`post`・`source` には投稿IDを指定します。
`categories` でカテゴリIDを調べられます。

`topics` と `posts` は `--page`（既定：1）と `--limit`（1～40件、既定：20件）を指定できます。
取得するのは指定ページだけで、`--limit` はそのページから表示する件数の上限です。
指定件数に達するまで次ページを取得することはありません。
投稿本文はプレーンテキストで表示し、`source` は元のBBCodeを表示します。
フォロー・解除は、使用するアカウントとトピックを確認してから実行します。
トピック作成・返信の投稿・投稿の編集には対応していません。

## Scratchホームの情報

```bash
scc home                         # 通信せず、利用可能なセクションを表示
scc home whats-happening         # 最新の活動（ログイン必須）
scc home news                    # Scratchニュース
scc home featured-projects       # 注目のプロジェクト
scc home featured-studios        # 注目のスタジオ
scc home design-studio           # Scratch Design Studio
scc home following-loves         # フォロー中のユーザーが好きな作品（ログイン必須）
scc home most-loved              # 人気の好きな作品
scc home most-remixed            # よくリミックスされている作品
scc home newest-projects         # 新着作品
scc home following-projects      # フォロー中のユーザーの共有作品（ログイン必須）
scc home following-studio-projects # フォロー中のスタジオの作品（ログイン必須）
scc home viewed-projects         # 閲覧履歴（ログイン必須）
```

`home` は別名 `frontpage` でも使用できます。
`--limit` は1～40件（既定：10件）、`--offset` は取得開始位置（既定：0）です。
公開セクションにはログイン不要です。個人向けの活動・フィード・閲覧履歴にはログイン中のアカウントを使用します。

## Scratchの作品・スタジオを探す

```bash
scc explore project                    # 傾向の作品
scc explore project --mode popular     # 人気の作品
scc explore project --category animations
scc explore project --mode popular --category games
scc explore studio --mode popular      # 人気のスタジオ
scc explore project --limit 20 --offset 20
scc explore project --language ja
```

`--mode` は `trending`（既定）または `popular` を指定します。
`--limit` は1～40件（既定：10件）、`--offset` は取得開始位置（既定：0）です。
作品の `--category` は `all`（既定）・`animations`・`art`・`games`・`music` から選べます。
スタジオにはカテゴリを指定しません。
`--language` はScratchから取得する結果の言語を指定します。既定は `en`、日本語は `ja` です。
CLI自体の表示言語を変更するオプションではありません。

## Scratchを検索する

```bash
scc search project "platformer"                 # 傾向の検索結果
scc search project "platformer" --mode popular  # 人気の検索結果
scc search project "ゲーム" --language ja
scc search studio "animation" --mode popular
```

`--mode` は `trending`（既定）または `popular`、`--limit` は1～40件（既定：10件）です。
`--offset` で取得開始位置を指定できます。
`--language` は取得する結果の言語を指定します。既定は `en`、日本語は `ja` です。

## メッセージ

`scc login` 後に、ログイン中のアカウントのメッセージを取得できます。

```bash
scc notifications
scc notifications --limit 20 --offset 20
scc notifications count
scc notifications read
```

`--limit` を省略すると、未読数と同じ件数を上限40件まで取得します。
取得する一覧は未読メッセージだけに絞り込むものではなく、件数の既定値を未読数に合わせています。
`count` は未読数だけを表示し、`read` は対話確認後にすべてのメッセージを既読にします。
`scc messages` は `scc notifications` の別名です。

## Scratchの規約・ガイドライン

```bash
scc legal community-guidelines
scc legal terms
```

Scratch公式のコミュニティーガイドラインや利用規約のタイトルとURLを表示します。
