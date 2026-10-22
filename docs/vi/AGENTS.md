# AGENTS.md: làm việc với fullmark

[English](../../AGENTS.md) | Tiếng Việt

Bản dịch của `AGENTS.md`. Agent đọc bản tiếng Anh (`quiz agent-guide` in ra bản đó); nếu hai bản khác nhau, bản tiếng Anh là bản đúng.

fullmark biến một file Markdown thành một file HTML quiz offline, tự chấm điểm. File này dành cho agent AI. Nó nói về việc **dùng** fullmark (Việc 1, 2 và 4: viết, chấm và lưu quiz) và **sửa** fullmark (Việc 3: phát triển công cụ).

## Thông tin nhanh

- CLI: `quiz` (cài bằng `uv tool install --editable <đường dẫn tới kho mã>`). Trong kho mã, dùng `uv run quiz ...`.
- Tài liệu soạn quiz đầy đủ: chạy `quiz guide`. File này: chạy `quiz agent-guide` (chạy được cả khi không có kho mã). Đó là nguồn chuẩn về cú pháp. Hãy đọc trước khi viết quiz; đừng đoán.
- Ví dụ để sao chép: `examples/calculus/`, `examples/rust/`, `examples/ielts/`, `examples/medical/`, `examples/exam/` (mỗi thư mục có `quiz.md`, file `quiz.html` đã dựng, và `assets/` khi cần). `quiz new calculus|rust|ielts|medical|exam|blank [PATH]` sao chép một mẫu và không bao giờ ghi đè.
- Mã thoát của `check` và `build`: 0 = ổn (cho phép cảnh báo), 1 = quiz có lỗi, 2 = sai cách dùng hoặc lỗi đọc ghi. Với `--strict`, mọi cảnh báo cũng thành 1 (dùng trong CI; `build --strict` không ghi gì).
- Không có gì cần mạng. Đừng thêm yêu cầu mạng vào trang; test kiểm tra rằng không có yêu cầu nào.

## Việc 1: soạn một quiz

1. Đọc tài liệu nguồn, rồi chạy `quiz guide`.
2. Viết `quiz.md`: phần đầu YAML (bắt buộc có `title`; đặt trong ngoặc kép nếu có dấu hai chấm), các phần `#` tùy chọn, các câu hỏi `##`.
3. Chạy `quiz check quiz.md` (thêm `--json` để đọc kết quả bằng máy). Đầu ra có dạng `file:line: error|warning: qN (type): message`. Sửa mọi lỗi; sửa cả cảnh báo, thường là thiếu `> [!explanation]`. `quiz check` còn bắt các câu hỏi yếu (giải thích quá ngắn, "tất cả các ý trên", đáp án đúng dài hơn hẳn các lựa chọn khác, đáp án lộ trong đề, vị trí đáp án lệch). Hãy sửa cả những lỗi này; đó là lỗi agent hay mắc. `quiz inspect quiz.md` cho thấy dạng câu, điểm, các phần, thẻ và vị trí đáp án, để bạn đối chiếu độ bao phủ với tài liệu nguồn.
4. Trong lúc sửa, `quiz watch quiz.md` dựng lại mỗi lần lưu (tải lại trang sau mỗi lần dựng, hoặc dùng `--serve` để trình duyệt tự tải lại).
5. Chạy `quiz build quiz.md` để ghi `quiz.html` bên cạnh (`-o OUT` để chọn chỗ, `--open` để mở). Đưa file đó cho người học.

Các quy tắc tránh phần lớn lỗi:

- Câu chọn đáp án: mỗi mục cần `[ ]` hoặc `[x]`. Một `[x]` là một đáp án, từ hai `[x]` trở lên là nhiều đáp án.
- `truefalse`, `numeric`, `short`, `fields`, `essay` và `code` cần một khối code có info string là `answer`, chứa YAML (`value`, `tolerance`, `accept`, `patterns`, `min_words`, `rubric`, `language`, `starter`).
- `ordering`: viết danh sách đánh số theo thứ tự **đúng** (trang sẽ xáo trộn). `matching`: các gạch đầu dòng `left :: right`; gạch đầu dòng `:: right` là phương án nhiễu. Cả hai không dùng khối `answer`. Cả hai theo `multi_scoring` (`partial` hoặc `all_or_nothing`).
- `blanks` dùng `[[answer|variant]]` ngay trong dòng, kể cả trong khối code.
- Thuộc tính tiêu đề đặt ở cuối dòng `##`: `{type=numeric points=2 id=q-area tags=limits}`. Thẻ không có dấu cách; chúng tạo nên báo cáo theo chủ đề.
- Đáp án số được so sánh như số, không phải về mặt ký hiệu. Với đáp án `short`, liệt kê mọi cách viết được chấp nhận.
- Ngân hàng câu hỏi: viết thêm câu và đặt `pick: N` (ở phần đầu) hoặc `{pick=N}` trên các phần để mỗi lần làm bốc ngẫu nhiên một tập con. Bản xuất ghi lại lần bốc (`attempt.bank`) và `quiz grade` kiểm tra nó. Dùng cho luyện tập, không dùng khi mọi người phải thấy cùng một bộ câu.
- Bảng hỏi: `mode: survey` (ở phần đầu) làm mọi câu không chấm điểm và trang không hiện điểm; `graded=false` trên một tiêu đề `##` làm vậy cho một câu; `{type=scale}` là một hàng thang đánh giá. Các câu không chấm điểm là `single`, `multi`, `short`, `fields`, `essay`, `ordering` (xếp hạng) và `scale`; không viết `[x]`, không có khối `answer` cho `short`, không có rubric cho `essay`. Dùng bảng hỏi thay vì hỏi quá khoảng năm câu trong chat, hoặc khi người dùng muốn giữ câu trả lời. Bắt đầu từ `quiz new survey`. Khi bạn đang chờ câu trả lời, hãy nhận trực tiếp: chạy `quiz serve quiz.md --once --open --json` ở chế độ nền (thoát 0 khi người trả lời bấm Finish, 2 khi hết `--timeout`) và đọc file kết quả có tên trong đầu ra JSON; đừng bao giờ chạy nó theo cách chặn bạn.
- Chữ bổ sung cho một lựa chọn: kết thúc một lựa chọn `single` hoặc `multi` bằng `{input}` hoặc `{input="What is it?"}` (lời nhắc mặc định "Please specify") để hỏi thêm vài chữ khi nó được chọn, ví dụ "Khác". Dùng được trong quiz và bảng hỏi, có chấm điểm hay không, và không bao giờ đổi điểm. Bản xuất thêm `response.inputs` (`{"2": "text"}`, chỉ số lựa chọn gốc) và `quiz grade` hiện `Something else: text` (`answer_text`, cùng `inputs` thô trong báo cáo JSON). Dấu đánh dấu phải ở cuối dòng và lời nhắc cần ngoặc kép; dùng trên dạng câu khác là lỗi.
- Brief: với quiz mới, trước hết tìm `brief.yaml` trong thư mục quiz và đọc nó. Nó chứa mục đích, phạm vi, tài liệu (`content/`), số câu, tỉ lệ dạng câu, độ khó, chế độ, chủ đề yếu (`focus_tags`) và ngôn ngữ. Nếu `request` đã được điền, đừng hỏi lại các câu của brief. Các giá trị chỉ người dùng được quyết là **mục đích và phạm vi**: nếu thiếu `brief.yaml` và người dùng chưa nói, hãy hỏi, hoặc chạy `quiz brief DIR --web` để họ điền; `quiz brief DIR ...` thoát với mã 3 cho đến khi có cả hai, và `--accept-defaults` không bao giờ cho bạn phạm vi. Chỉ dùng `--accept-defaults` khi người dùng đã giao các lựa chọn đó cho bạn, và liệt kê những gì bạn chọn. Khi `past-exams` được đánh dấu, hãy theo cấu trúc của chúng (dạng câu, cách chia điểm, độ dài) và trích dẫn trong phần giải thích dưới dạng `Source: file, question N`. `quiz check` cảnh báo khi quiz lệch khỏi brief (`brief.count`, `brief.mix`, `brief.past-exams`, `brief.content-kinds`).
- Rà lại những gì bạn viết: quiz do agent viết có thể sai đáp án hoặc có câu không nằm trong tài liệu, và chỉ người học mới đánh giá được. Sau khi viết quiz từ tài liệu, hãy đề nghị `quiz review quiz.md`; khi người dùng đồng ý, chạy `quiz review quiz.md --once --open --json` ở chế độ nền và chờ (thoát 0 khi người học bấm Finish, 2 khi hết `--timeout`). JSON của nó liệt kê các câu `flagged` (kết luận, nội dung, vấn đề, ghi chú) và số lượng. Sửa những gì bị đánh dấu **bằng cách sửa file nguồn**, rồi chạy `quiz check quiz.md --review review.json`: `review.drop`, `review.fix` và `review.key-wrong` là lỗi cho đến khi các câu được thay đổi. Đề nghị `quiz review quiz.md --since review.json` cho các câu đã sửa. `review: true` ở phần đầu chỉ do biểu mẫu review tạo ra; đừng bao giờ viết nó trong quiz. Đừng bao giờ tự viết hay sửa `review.json`: đó là kết luận của người học (nó ghi `"by": "quiz review"`), và công cụ kiểm tra không phân biệt được. Đặt `{id=...}` cho câu hỏi để bản review vẫn khớp khi thứ tự thay đổi; nếu không, việc so khớp dựa trên mã băm nội dung câu.
- Đặt ảnh trong `assets/` và tham chiếu theo đường dẫn tương đối (`![alt](assets/x.png)`); chúng được nhúng dưới dạng data URI. Không có video, không có URL web.
- Mỗi câu chấm tự động cần một phần giải thích. Viết rubric cho tự luận và code thật cụ thể, vì sau này bạn sẽ chấm theo chúng.
- Đáp án nằm trong file HTML, chỉ được làm rối nhẹ. Đừng bao giờ mô tả quiz là an toàn hay bảo mật.

## Việc 2: chấm kết quả

Người học bấm Submit, rồi Export answers, tạo ra `<id>-results-<date>.json`. JSON Schema của nó là `src/fullmark/schemas/results-v1.schema.json`; báo cáo `--json` có `report-v1.schema.json` bên cạnh. Cả hai mang trường `version`; các trường tùy chọn mới không đổi số phiên bản, nên hãy bỏ qua các khóa bạn không biết.

```powershell
quiz grade results.json --quiz quiz.md        # ghi results-report.md cạnh file kết quả
quiz grade results.json --quiz quiz.md --json # ghi results-report.json thay vào đó (nên dùng cho agent)
```

- Sau khi Submit, người học có thể bấm **Retry missed**. Bản xuất đó có `attempt.retry_of` (`started_at` của lần làm trước) và `attempt.bank.drawn` chỉ liệt kê các câu đã sai; `quiz grade` chấp nhận nó mà không cảnh báo về lần bốc.
- Python chấm lại từ file nguồn của quiz và là bản có thẩm quyền. Nếu nó khác điểm của trình duyệt, nó cảnh báo và dùng điểm của mình. Nó cũng cảnh báo nếu `quiz.md` đã thay đổi sau lần làm.
- Nên dùng `--json`. Nó có `summary`, `by_topic` và danh sách `questions`; mỗi câu có `status`, `earned`, `points`, `your_answer`, `correct_answer`, `explanation`, `needs_review` và `needs_ai_grading`. Câu tự luận, code và ô không chấm điểm còn có đối tượng `ai_grading`: `rubric`, `criteria`, `scoring`, và `response` của người học (cùng `word_count`, `language`, v.v.).
- Câu không chấm điểm (`graded=false`, `scale`, mọi câu trong bảng hỏi) có `status: "ungraded"` (hoặc `unanswered`), `earned: null`, `ungraded: true`, `response` thô và `answer_text` dễ đọc; chúng không bao giờ nằm trong `needs_review` hay `needs_ai_grading`, và mẫu điểm không bao giờ liệt kê chúng. Để đọc một bảng hỏi: `quiz grade results.json --quiz quiz.md --json` và đọc `answer_text` của từng câu (`attempt.mode` và `mode` ở cấp trên cùng ghi `survey`); báo cáo Markdown của bảng hỏi có tiêu đề "Answers" và không có điểm.
- Báo cáo Markdown có phần tóm tắt, bảng theo thẻ, bảng theo câu, phần **Answers** (chỉ khi quiz có câu không chấm điểm), **Review these** (câu sai hoặc đúng một phần, kèm đáp án đúng và giải thích), và **Pending AI review**.
- Việc của bạn là phần **Pending AI review**: với mỗi câu tự luận và code, đọc câu trả lời của người học theo rubric và điền khối **Grading** còn trống (điểm trên tổng điểm của câu, lý do ngắn gọn, một gợi ý cải thiện cụ thể). Câu trả lời dạng code không bao giờ được chạy; hãy chấm bằng cách đọc.
- Cách ghi điểm nên dùng: `quiz grade results.json --quiz quiz.md --json` cũng ghi `<results>-grades.json`, một mẫu trống (schema `grades-v1.schema.json`). Điền `score` (từ 0 đến số điểm của câu), `band` (0-9, bước 0,5), `criteria`, `justification` và `improvement` cho từng id, rồi chạy lại cùng lệnh với `--grades <file>`. Lỗi (id không tồn tại, điểm ngoài khoảng, band sai) thoát với mã 1. Khi đó báo cáo mang mỗi điểm dưới `ai_grading.result` và `summary.final_earned`, `final_possible` và `final_percent`. Câu tính theo band được báo cáo nhưng không cộng vào điểm. Mẫu đã có sẽ không bao giờ bị ghi đè.
- Để xem tiến bộ qua nhiều lần làm một quiz: `quiz stats a.json b.json c.json [--quiz quiz.md] [--json]` in điểm theo ngày, phần trăm theo chủ đề ở từng lần cùng thay đổi từ lần đầu đến lần cuối, và ba chủ đề yếu nhất của lần gần nhất, cộng bảng "Answers over time" cho câu `scale` và câu `single` không chấm điểm (câu không chấm điểm không bao giờ vào điểm; bảng hỏi cũng dùng được). Các quiz khác nhau thoát với mã 2; quiz đã thay đổi chỉ cảnh báo.
- Sau đó tóm tắt cho người học: chủ đề yếu trước, những gì cần ôn lại, và cách sửa cho từng câu sai. Đừng sửa câu trả lời của người học hay file JSON.
- Tự luận có `scoring: band` (đặt trong khối `answer`, kiểu IELTS) cần một band 0-9; cho một band cho mỗi tiêu chí nếu rubric liệt kê tiêu chí.

Trong Claude Code, skill `/quiz` bao gồm cả hai việc. Mã nguồn của nó là `skill/SKILL.md` trong kho này (được liên kết vào `~/.claude/skills/quiz`); `tests/test_skill.py` báo lỗi nếu skill nhắc đến lệnh, cờ hoặc mẫu mà CLI không có.

## Việc 3: phát triển fullmark

Cấu trúc (`src/fullmark/`):

| Đường dẫn | Vai trò |
|---|---|
| `parser.py`, `models.py`, `validate.py` | Markdown thành mô hình pydantic, kèm số dòng; mọi thông báo lỗi |
| `grading.py` và `static/quiz.js` | Cùng một bộ quy tắc chấm viết hai lần (Python có thẩm quyền, JS trong trang). Sửa cả hai cùng lúc |
| `render.py`, `build.py`, `theme.py`, `templates/`, `static/quiz.css` | Trang HTML. Màu chỉ nằm trong `theme.py`; CSS dùng `var(--name)` |
| `report.py` | Báo cáo Markdown |
| `checking.py`, `serve.py` | Các phát hiện phía sau `quiz check`; các máy chủ cục bộ (`watch --serve`, `serve`, `review`, `take`) và `serve_loop` |
| `library/` | `quiz library`: cấu hình, sổ đăng ký, git, bảng trong terminal. Nó import core; core không bao giờ import nó (`tests/test_layers.py`); `cli.py` chỉ import nó bên trong hàm xử lý `library` |
| `cli.py`, `templates_cmd.py`, `guide.md`, `agents.md` | CLI, `quiz new`, văn bản do `quiz guide` và `quiz agent-guide` in ra |
| `examples/` | Các mẫu đóng gói, dùng bởi `quiz new` và test |
| `vendor/katex/` | KaTeX 0.16.47 đóng gói sẵn. Không sửa |

Thư mục `examples/` ở gốc chứa bản sao các quiz ví dụ cùng HTML đã dựng. Gói không đọc chúng. File đóng gói mới là nguồn. Sau khi sửa một ví dụ đóng gói, `quiz.css` hoặc `quiz.js`, chạy `uv run python scripts/sync_examples.py` để chép sang và dựng lại HTML; test báo lỗi khi chúng lệch nhau. Cùng script đó chép `src/fullmark/agents.md` (nguồn của file này) sang `AGENTS.md` ở gốc; hãy sửa bản đóng gói.

Quy trình:

```powershell
uv sync
uv run pytest -q                       # toàn bộ test, khoảng 5 phút, gồm test trên trình duyệt thật
uv run pytest -q --ignore=tests/e2e    # bỏ qua test trình duyệt
```

- Thay đổi bộ chấm: thêm một ca chuẩn (`uv run python tests/make_grading_cases.py`); các ca chạy qua cả Python và JS và phải cho cùng kết quả.
- Lỗi kiểm tra mới: thêm một fixture (`tests/fixtures/make_fixtures.py`).
- Tài liệu: `docs/GUIDE.md` (hướng dẫn sử dụng), `docs/SPEC.md` (các quyết định thiết kế), `src/fullmark/guide.md` (tài liệu soạn quiz). Giữ các bảng cú pháp trong `guide.md` và `GUIDE.md` khớp nhau, rồi chạy `uv run python docs/build_docs.py` để dựng lại HTML.
- Ảnh ví dụ: `uv run python src/fullmark/examples/make_assets.py`.
- Quy tắc giao diện mà test bắt buộc: không có yêu cầu mạng, giới hạn độ tương phản ở cả chế độ sáng và tối, dùng được bằng bàn phím. Đừng chỉ dùng màu để báo đúng hay sai; các huy hiệu có ký hiệu.
- Phong cách: Python được ruff kiểm tra, JS/JSON bởi Biome, Markdown bởi markdownlint. Một hook định dạng các file được sửa; hãy sửa những gì nó báo.

Quy tắc làm việc (mọi thay đổi):

- Đọc file này trước khi thay đổi bất cứ thứ gì.
- Một việc, một commit. Chạy `uv run pytest -q` trước mỗi commit; phải qua. Một lỗi chập chờn đã biết khi máy bận: Windows ngắt socket (WinError 10053); chạy riêng test đó trước khi coi là lỗi thật. Trong test trình duyệt, hãy chờ thứ mà việc đổi kích thước hay cú nhấp làm thay đổi (`wait_for_selector`, `wait_for_function`) thay vì kiểm tra ngay.
- Thay đổi cú pháp thì cập nhật `src/fullmark/guide.md` **và** `docs/GUIDE.md`. Thay đổi trang (CSS, JS, template) hoặc một ví dụ đóng gói thì kết thúc bằng `uv run python scripts/sync_examples.py`.
- Mọi truy cập localStorage đi qua hàm bọc `store()` trong `quiz.js`; nó xử lý được khi bộ nhớ bị chặn.
- Giữ `ruff check`, `ruff format --check`, `biome lint src/fullmark/static/quiz.js` và `ty check src/fullmark/library src/fullmark/serve.py` sạch lỗi.
- Một thư viện phụ thuộc mới làm thay đổi công cụ đã cài: ghi trong README rằng cần chạy `uv tool install --editable <đường dẫn tới kho mã> --reinstall`.
- Không bao giờ động vào thư viện hay cấu hình thật của người dùng (`quiz library path` cho biết vị trí) ngoài việc đọc; test và kiểm tra thủ công dùng `FULLMARK_CONFIG`, `GIT_CONFIG_GLOBAL` và `GIT_CONFIG_NOSYSTEM` tạm (fixture `lib` trong `tests/conftest.py`).
- Dừng lại và hỏi người dùng trước bất cứ việc gì cần tài khoản, remote hay phát hành. Không bao giờ push; không bao giờ phát hành lên kho gói.
- Kế hoạch: lộ trình là `docs/PLANNED.md` (gạch các mục khi xong: `~~item~~: done`). Kế hoạch cho thay đổi lớn đặt ở `docs/plans/NAME_PLAN.md` và có một dòng trong `docs/plans/README.md`. Thư mục gốc chỉ chứa `README.md` và `AGENTS.md`; bản tiếng Việt nằm trong `docs/vi/`.

## Việc 4: thư viện

`quiz library` giữ quiz và kết quả của người dùng trong một thư mục có git. Các lệnh: `init`, `status`, `register`, `list`, `take`, `share`, `path`, `grade`, `stats`, `rename`, `rm`. Mã thoát: 0 xong, 1 có vấn đề hoặc quiz bị từ chối, 2 sai cách dùng hoặc chưa có thư viện, 3 cần thông tin. Công cụ commit sau mỗi lần ghi và **không bao giờ push**. Mọi điều dưới đây là quy ước; thư viện của người dùng có thể có hoặc chưa có.

- **Kiểm tra trước.** `quiz library status --json`: `status` là `no_library` khi chưa thiết lập gì (thoát 2), `ok` hoặc `problems` trong các trường hợp khác. Đọc nó; không bao giờ sửa tay thư viện hay cấu hình.
- **Vòng lặp** cho một quiz bạn viết: `quiz check quiz.md` (sửa lỗi và cảnh báo), có thể `quiz review`, rồi `quiz library register quiz.md --json`. Không cần `quiz build` cho quiz của chính người dùng; file `.md` và `assets/` có thể nằm trong thư mục tạm của bạn. Ảnh phải nằm trong thư mục của quiz và được tham chiếu tương đối.
- **Mã thoát 3 nghĩa là hãy hỏi.** Khi chưa có thư viện, `register` thoát 3 với `{"status": "needs_input", "missing": [...], "fix": "quiz library init PATH"}`. Hỏi người dùng thư viện nên đặt ở đâu. **Không bao giờ tự chạy `init`**: không có PATH, nó biến thư mục hiện tại (thường là dự án) thành thư viện, và vị trí là do người dùng chọn. `init` từ chối thư mục có file khác (thoát 2); hãy đưa cho nó một thư mục mới hoặc trống, ví dụ `D:\quizzes`. Chỉ dùng `--force` sau khi người dùng đồng ý chuyển thư viện.
- **Trùng tên** thì thoát 1 và gợi ý một tên còn trống: đăng ký lại với `-n` và tên đó, và nói cho người dùng biết bạn đã dùng tên nào. Tên mặc định là tiêu đề chuyển thành slug, và JSON cho biết khi tên là mặc định (`name_defaulted`).
- **Sửa một quiz** phải làm rõ ràng. Xuất file nguồn bằng `quiz library share NAME --source -o DIR`, sửa file mà nó in ra, chạy `quiz check`, rồi `quiz library register DIR/NAME/FILE.md --update NAME`. Không bao giờ đoán một file thuộc quiz nào, và không bao giờ sửa file bên trong thư viện. Đăng ký lại cùng một file mà không có `--update` sẽ thoát với mã 1 và nêu tên quiz; với `--update NAME` thì an toàn: `unchanged`, hoặc `replaced` khi chưa ai làm phiên bản đó.
- **Lượt làm dở.** Nếu `take` đã lưu một lượt chưa nộp trên phiên bản mà bản cập nhật thay thế, `register` cảnh báo (stderr, và `warnings` trong JSON). Tiến độ đó bị phiên bản mới bỏ qua; báo người dùng đóng trang đang mở và chạy lại `quiz library take NAME`.
- **`register --json`** in `{"status": "registered"|"replaced"|"new-version"|"updated-assets"|"unchanged", "id", "name", "name_defaulted", "hash", "version_count", "committed", "take": "quiz library take <name>"}`. **Kết thúc tin nhắn của bạn bằng dòng `take`** để người dùng bắt đầu làm bài.
- **Chấm điểm.** Kết quả nằm trong `quiz library path NAME`/results, mỗi lần làm một file JSON, đặt tên theo ngày giờ. Chấm bằng `quiz library grade NAME --json` (lần mới nhất, hoặc `--attempt STAMP`): nó tìm đúng phiên bản đã làm và ghi `reports/<stamp>-report.json`, cùng một `reports/<stamp>-grades.json` trống khi có tự luận hoặc code cần chấm. Điền mẫu đó, rồi chạy `quiz library grade NAME --grades reports/<stamp>-grades.json --json`. Báo cáo nằm trong `reports/`, không bao giờ trong `results/`. `quiz library stats NAME [--json]` cho thấy tiến bộ qua mọi lần làm. File kết quả là của người học: đọc, đừng sửa.
- **`rm` và `rename` do người dùng quyết.** Không bao giờ chạy `quiz library rm` hay `rename` trừ khi người dùng yêu cầu cho đúng quiz đó. `rm` xóa quiz cùng các phiên bản và kết quả (git có thể hoàn tác); không bao giờ tự thêm `--yes` hay `--force`.
- **Không bao giờ push**, và không bao giờ chạy lệnh git trong thư viện. Kết quả chứa câu trả lời của người học và bản lưu chứa đáp án, nên mọi remote người dùng thêm vào phải là riêng tư; đó là bước của họ.
