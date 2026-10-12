# プロフィール概要の取得

`scc profile`（`about`）は、Scratchの公開プロフィールページを1回取得し、`#profile-data` 内から自己紹介、近況、ユーザー種別、参加日、国、最近の活動を抽出する。最近の活動はページに含まれる先頭10件までを表示し、追加ページを自動取得しない。

注目のプロジェクトは Scapi の `User.get_featured()` で別途1回取得する。Scapi の `ProjectFeatured.label` を表示見出しへ変換するため、`Featured Project` 以外の `Tutorial`、`Work in Progress` なども正しく表示できる。作品が設定されていなければ `None` とする。

HTMLにない任意項目は `None` または空の一覧として扱う。`#profile-data` と表示名がないページは正常なプロフィールとして扱わず、エラーを返す。ユーザーIDはアバター画像URLから取得できる場合のみ表示する。作品・お気に入りなどの一覧取得は従来どおりScratch APIを使用する。
