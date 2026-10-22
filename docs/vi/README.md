# Fullmark Alchemist

[English](../../README.md) | Tiếng Việt

`fullmark`: đưa vào Markdown, nhận về một bài quiz offline tự chấm điểm.

*Muốn đạt điểm tuyệt đối, phải học một lượng tương đương. Đó là định luật Trao đổi Ngang giá.*

Bản dịch này theo bản tiếng Anh; nếu hai bản khác nhau, bản tiếng Anh là bản đúng.

## Dự án này được làm thế nào

Fullmark được "vibe-code": gần như toàn bộ mã do các agent lập trình AI (Claude) viết, từ prompt, kế hoạch và nhận xét của tôi; tôi định hướng và thử nó trên chính các môn học của mình. Bộ kiểm thử (khoảng 700 test, gồm cả test trên trình duyệt thật và test khả năng tiếp cận) là thứ giữ cho nó đáng tin. Hãy đọc mã trước khi dùng nó cho việc gì quan trọng.

## Cài đặt

```sh
uv tool install fullmark      # hoặc: pipx install fullmark
quiz --help
```

Lệnh là `quiz`. Nếu máy đã có chương trình khác tên `quiz` (gói `bsdgames` của Debian và Ubuntu có một trò đố vui cũ cùng tên), hãy dùng `fullmark`, chạy đúng chương trình này.

Cài từ mã nguồn, trong bản clone của kho mã:

```sh
uv tool install --editable .
```

Trước bản 0.10.0, dự án có tên quizmd. Bản 0.10.0 không đọc kết quả hay thư viện của quizmd (định dạng dữ liệu, thư mục cấu hình và biến môi trường đều đã đổi tên); hãy tạo lại chúng từ các file Markdown gốc.

Sau khi kéo về một phiên bản có thêm thư viện phụ thuộc (0.9.0 thêm `tomli-w` và `rich`), hãy cài lại công cụ, nếu không lệnh `quiz` đã cài sẽ báo `ModuleNotFoundError`:

```sh
uv tool install --editable . --reinstall
```

Để phát triển: `uv sync`, rồi `uv run pytest` (test trình duyệt cần Chromium: `uv run playwright install chromium`).
Cách phát hành một phiên bản: [docs/RELEASING.md](../RELEASING.md) (tiếng Anh).

## Fullmark là gì

Biến một file Markdown thành **một file HTML quiz duy nhất, tự chứa mọi thứ**: mở bằng cách nhấp đúp, tự chấm điểm khi không có mạng, và xuất câu trả lời của người học ra JSON để AI xem lại. Trang dùng bảng màu dịu: nền giấy nhạt ở chế độ sáng, xám xanh ở chế độ tối. Một quiz có thể khóa giao diện (`theme: light`), như ví dụ IELTS làm để giống màn hình thi thật.

Tài liệu (tiếng Anh, trừ khi ghi khác): [hướng dẫn cho agent](../../AGENTS.md) ([tiếng Việt](AGENTS.md)), [hướng dẫn sử dụng](../GUIDE.md) ([HTML](../GUIDE.html)), [đặc tả thiết kế](../SPEC.md), và một [quiz về chính dự án này](../fullmark-project.html).

## Ảnh chụp màn hình

Màn hình bắt đầu: quiz có gì, thời gian gợi ý cho từng phần, chế độ Tập trung (Focus mode), và giờ bạn sẽ làm xong nếu bắt đầu ngay.

![Màn hình bắt đầu của một quiz 73 câu với tám phần có thời gian gợi ý](https://raw.githubusercontent.com/Hung-nd233960/fullmark/main/docs/screenshots/start-screen.png)

Câu hỏi, bên cạnh là đồng hồ, tiến độ và bản đồ câu hỏi:

![Một câu trắc nghiệm với bảng bên phải](https://raw.githubusercontent.com/Hung-nd233960/fullmark/main/docs/screenshots/questions.png)

Câu sắp xếp thứ tự (kéo thả, hoặc dùng nút Up và Down) và câu tự luận được AI chấm theo thang điểm (rubric):

![Một câu sắp xếp thứ tự](https://raw.githubusercontent.com/Hung-nd233960/fullmark/main/docs/screenshots/ordering.png)

![Hai câu tự luận có đếm số từ](https://raw.githubusercontent.com/Hung-nd233960/fullmark/main/docs/screenshots/written-answers.png)

## Fullmark và Anki

Hai công cụ làm hai việc khác nhau.

| | Anki | Fullmark |
|---|---|---|
| Hợp nhất cho | Ghi nhớ kiến thức: định nghĩa, công thức, giải phẫu | Luyện thi: bài tập có lời giải, nhiều dạng câu hỏi, đề thi thử đầy đủ |
| Đơn vị | Một thẻ | Một quiz, có các phần và điểm |
| Lịch ôn | Lặp lại ngắt quãng (spaced repetition) | Không có. Bạn tự quyết khi nào làm lại; thư viện lưu điểm và các chủ đề còn yếu |
| Dạng câu hỏi | Mặt trước và mặt sau, điền chỗ trống (cloze) | Trắc nghiệm, số có sai số cho phép, điền chỗ trống, ghép cặp, sắp xếp, tự luận và code do AI chấm |
| Dùng ở đâu | Ứng dụng trên mọi thiết bị, có đồng bộ | Một file HTML mở được ở bất cứ đâu, không cần tài khoản |

Dùng cả hai: Anki cho những gì phải nhớ, Fullmark để kiểm tra bạn có vận dụng được trong điều kiện thi hay không.

## Quy trình

1. AI đọc tài liệu học và viết quiz theo định dạng Markdown của fullmark (`quiz guide` in ra định dạng).
2. `quiz check quiz.md` kiểm tra quiz, báo lỗi kèm số dòng; sửa đến khi qua.
3. `quiz build quiz.md --open` tạo ra `quiz.html`.
4. Người học trả lời, bấm **Submit**, rồi **Export answers** (`results.json`).
5. `quiz grade results.json --quiz quiz.md` viết báo cáo Markdown; AI chấm phần tự luận và code dựa vào đó.

## Hai tầng: lõi và thư viện

- **Lõi** (`quiz check`, `build`, `serve`, `grade`, ...) làm việc với file: đưa vào Markdown, nhận ra một trang HTML hoặc một file JSON. Không cần cài đặt hay cấu hình gì, và chỉ cần nó là đủ để làm một quiz và chia sẻ.
- **Thư viện** (`quiz library ...`, có từ 0.9.0, thiết kế ở [docs/plans/LIBRARY_PLAN.md](../plans/LIBRARY_PLAN.md)) giữ các quiz của riêng bạn trong một thư mục có git: đăng ký quiz một lần (file nguồn có thể là file tạm), làm bài bằng `quiz library take NAME`, và mỗi kết quả được lưu cạnh đúng phiên bản bạn đã làm. Trang được dựng ngay lúc mở, nên luôn dùng bản fullmark đang cài. Thư viện gọi đến lõi và không thêm gì vào trang, nên trang chia sẻ vẫn là file offline bình thường. Lõi không bao giờ phụ thuộc vào thư viện.

## Các lệnh của lõi

| Lệnh | Tác dụng |
|---|---|
| `quiz check FILE [--json] [--strict] [--review REVIEW]` | Kiểm tra. Mã thoát 0 = không lỗi (cho phép cảnh báo), 1 = có lỗi, 2 = sai cách dùng hoặc lỗi đọc ghi |
| `quiz build FILE [-o OUT] [--open] [--strict]` | Kiểm tra, rồi ghi file HTML duy nhất; `--strict` coi cảnh báo là lỗi và không ghi gì |
| `quiz watch FILE [-o OUT] [--open] [--serve]` | Dựng lại mỗi khi quiz hoặc thư mục `assets/` thay đổi; giữ bản dựng tốt gần nhất khi lần lưu có lỗi. Tải lại trang sau mỗi lần dựng, hoặc thêm `--serve` để phục vụ trên 127.0.0.1 và trình duyệt tự tải lại (chỉ bản được phục vụ có mã tự tải lại; file bạn phát cho người khác không đổi) |
| `quiz serve FILE [--out RESULTS] [--once] [--timeout SECONDS] [--open] [--focus] [--port N] [--autosave PROGRESS] [--json]` | Phục vụ trang trên 127.0.0.1; **Finish** hoặc **Submit** gửi kết quả về và máy chủ ghi file JSON rồi thoát (`--once` là mặc định khi stdout không phải terminal; mã thoát 2 khi hết thời gian chờ). Dành cho bảng hỏi mà một công cụ hay agent đang chờ. `--focus` bật sẵn chế độ Tập trung; `--autosave` giữ bài đang làm dở để tiếp tục sau khi máy chủ hoặc trình duyệt đóng |
| `quiz review FILE [--out REVIEW] [--since REVIEW] [--once] [--open] [--timeout SECONDS] [--port N] [--json]` | Người học xem từng câu (giữ, sửa hay bỏ) trong một biểu mẫu; **Finish** ghi `review.json`. Sau đó `quiz check FILE --review review.json` báo lỗi đến khi các câu bị đánh dấu được sửa |
| `quiz brief DIR [--purpose P] [--scope S] [--count N] [--web] [--accept-defaults] [--json] ...` | Ghi `brief.yaml` và `content/` cho quiz mà agent sẽ viết. Thiếu mục đích (purpose) hoặc phạm vi (scope) thì thoát với mã 3; `--web` hỏi qua biểu mẫu. Sau đó `quiz check` cảnh báo khi quiz không khớp với brief |
| `quiz grade RESULTS [--quiz FILE] [-o OUT] [--grades GRADES] [--json]` | Chấm lại bằng Python (bản chấm có thẩm quyền) và viết báo cáo; `--json` ghi `*-report.json` cùng một mẫu `*-grades.json` trống; `--grades` đưa file điểm đã điền vào báo cáo |
| `quiz stats RESULTS... [--quiz FILE] [--json]` | Tiến bộ qua nhiều lần làm một quiz: điểm theo ngày, phần trăm theo chủ đề, các chủ đề yếu nhất |
| `quiz inspect FILE [--json] [--review REVIEW]` | Tóm tắt quiz: dạng câu, điểm, các phần, thẻ, vị trí đáp án; với `--review`, số câu giữ, cần sửa và cần bỏ |
| `quiz new TEMPLATE [PATH]` | Sao chép mẫu `calculus`, `rust`, `ielts`, `medical`, `exam`, `survey` hoặc `blank` cùng tài nguyên của nó; không bao giờ ghi đè |
| `quiz templates` | Liệt kê các mẫu |
| `quiz guide` | In tài liệu soạn quiz |
| `quiz agent-guide` | In hướng dẫn cho agent AI (`AGENTS.md`, tiếng Anh) |

## Các lệnh của thư viện

Mười một lệnh, đều nằm dưới `quiz library`. Mã thoát: 0 xong, 1 có vấn đề (hoặc quiz bị từ chối), 2 sai cách dùng hoặc không có gì để làm, 3 cần người dùng nhập thông tin (`register` khi chưa có thư viện). Thiết kế ở [docs/plans/LIBRARY_PLAN.md](../plans/LIBRARY_PLAN.md).

| Lệnh | Tác dụng |
|---|---|
| `quiz library init [PATH] [--force] [--no-git] [--json]` | Biến PATH (mặc định: thư mục hiện tại) thành thư viện của máy này, chạy `git init` và ghi vào cấu hình (`%APPDATA%\fullmark\config.toml` trên Windows, `~/.config/fullmark/config.toml` trên Linux). Thư mục mới, chưa tồn tại hoặc trống thì được thiết lập; thư viện có sẵn thì được dùng lại; thư mục chứa file khác thì bị **từ chối** (mã thoát 2, không ghi gì; hãy dùng thư mục mới như `PATH/fullmark-library`). Chuyển từ thư viện khác cần `--force` |
| `quiz library status [--json] [--plain]` | Chẩn đoán: cấu hình, đường dẫn thư viện, git (kho, thay đổi chưa commit, remote), các con số, bản lưu không còn khớp mã băm, file mồ côi. Có màu khi chạy trong terminal; `--plain` hoặc `NO_COLOR` cho văn bản thường. Mã thoát 0 ổn, 1 có vấn đề, 2 chưa có thư viện |
| `quiz library register FILE.md [-n NAME \| --update NAME] [--strict] [--review REVIEW] [--json]` | Kiểm tra quiz, rồi chép file nguồn, tài nguyên và brief vào thư viện (không lưu HTML) và commit. Sau đó có thể xóa file nguồn. `--update` thêm một phiên bản cho quiz đã có. Đây là bước cuối khi agent viết quiz; thoát với mã 3 nếu chưa có thư viện |
| `quiz library list [--json] [--plain]` | Mọi quiz kèm số phiên bản, số lần làm, điểm gần nhất, và ghi chú khi file nguồn gốc vẫn còn và đã thay đổi |
| `quiz library take NAME [--no-open] [--focus] [--timeout SECONDS] [--port N] [--json]` | Dựng trang ngay bằng bản fullmark đang cài, phục vụ nó, lưu kết quả vào thư viện và commit; đóng tab vẫn tiếp tục được |
| `quiz library share NAME [-o DIR] [--version H] [--source]` | Dựng trang offline sạch để chia sẻ (cùng với `quiz build`, đây là cách duy nhất để có một file HTML độc lập); `--source` ghi thư mục nguồn có thể sửa thay vì trang, với tên file gốc, tài nguyên và brief |
| `quiz library grade NAME [--attempt STAMP] [--grades FILE] [--json]` | Chấm một lần làm (mặc định là lần mới nhất) theo đúng phiên bản đã làm và ghi báo cáo vào `quizzes/<id>/reports/` (không bao giờ vào `results/`); `--json` ghi thêm mẫu điểm ở đó. Commit báo cáo |
| `quiz library stats NAME [--json]` | Tiến bộ qua mọi lần làm: điểm theo ngày, phần trăm theo chủ đề, chủ đề yếu nhất. Khi các lần làm thuộc nhiều phiên bản, dùng điểm của chính từng lần. Không ghi gì |
| `quiz library rename OLD NEW [--json]` | Đổi tên quiz (id và thư mục giữ nguyên) và commit |
| `quiz library rm NAME [--yes] [--force] [--json]` | **Xóa** quiz cùng các phiên bản và kết quả, rồi commit, nên `git -C LIBRARY revert HEAD` lấy lại được. Bị từ chối khi thư viện không phải kho git riêng hoặc thư mục quiz có thay đổi chưa commit (`--force` bỏ qua cả hai); hỏi xác nhận trừ khi có `--yes`. Ảnh vẫn ở lại trong `assets/` |
| `quiz library path [NAME]` | In thư mục thư viện hoặc thư mục của một quiz; kết quả và bản lưu là các file bình thường ở đó |

Để sau, khi cần: `sync`, `replay`, `--web` (xem [docs/PLANNED.md](../PLANNED.md)). Kế hoạch làm `grade`, `stats`, `rename` và `rm` ở [docs/plans/LIBRARY_HOUSEKEEPING_PLAN.md](../plans/LIBRARY_HOUSEKEEPING_PLAN.md).

### Sao lưu

Thư viện là một thư mục bình thường có lịch sử git trên máy, bảo vệ bạn khỏi nhầm lẫn (sửa tay một bản lưu, một file hỏng) nhưng không bảo vệ khi mất ổ đĩa. fullmark commit sau mỗi `init`, `register`, `take`, `grade`, `rename` và `rm`, và **không bao giờ push**. Kết quả chứa câu trả lời của bạn và bản lưu chứa đáp án, nên chỉ push lên một remote **riêng tư**. Muốn sao lưu tự động, hãy thêm hook `post-commit` trong `.git/hooks` của thư viện để chạy `git push`; đó là hook của bạn, không phải của fullmark.

## Các dạng câu hỏi

Một đáp án, nhiều đáp án, đúng/sai, số (có sai số cho phép, phân số), trả lời ngắn (danh sách chuỗi chấp nhận và biểu thức chính quy), điền chỗ trống (cả trong khối code), các ô có nhãn, ghép cặp, sắp xếp thứ tự, tự luận và code (cả hai được xuất ra để AI chấm). Bảng hỏi có thêm câu không chấm điểm và thang đánh giá (`mode: survey`). Công thức LaTeX (KaTeX, chỉ nhúng khi dùng), code được tô màu, ảnh và âm thanh đều được nhúng dưới dạng data URI. Có sẵn đồng hồ, phản hồi ngay hoặc cuối bài, ngân hàng câu hỏi bốc ngẫu nhiên, tiếp tục sau khi tải lại trang, chế độ Tập trung, và bản xuất JSON có phiên bản. Một lựa chọn có thể hỏi thêm vài chữ khi được chọn (`- [ ] Something else {input="What is it?"}`); phần chữ này được xuất và đưa vào báo cáo nhưng không bao giờ được chấm.

Một quiz tối giản:

````markdown
---
title: Thủ đô
---

## Thủ đô của Pháp là gì?

- [ ] Lyon
- [x] Paris

> [!explanation]
> Paris là thủ đô từ năm 987.
````

## Ghi chú

- Đáp án nằm ngay trong file HTML, chỉ được làm rối nhẹ (XOR với khóa suy ra từ mã băm của quiz). Điều này chỉ ngăn nhìn trộm tình cờ. Đây không phải tính năng bảo mật cho kỳ thi.
- Trang không gửi bất kỳ yêu cầu mạng nào; Content Security Policy chặn chúng, và test trình duyệt kiểm tra điều đó.
- Cấu hình dự án: `.markdownlint-cli2.jsonc` (quy tắc của người dùng, trừ MD025 và MD028 mà định dạng cần), `biome.json` cho JavaScript chạy trong trang.
- Tạo lại fixture và ảnh ví dụ:
  `uv run python tests/fixtures/make_fixtures.py`,
  `uv run python tests/make_grading_cases.py`,
  `uv run python src/fullmark/examples/make_assets.py`,
  `uv run python docs/build_docs.py` (dựng lại `docs/GUIDE.html` và `docs/fullmark-project.html`).
- KaTeX 0.16.47 được đóng gói sẵn trong `src/fullmark/vendor/katex/` (giấy phép MIT, xem `LICENSE` của nó).
