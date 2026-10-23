/**
 * Sample content for the "english-center" theme: categories and posts written to one shared format.
 * The static pages come with the theme itself (themes/english-center/pages.json). Run after `npm run db:seed`. Safe to run again: existing slugs are left alone.
 * Everything here is placeholder text and can be edited or deleted in the admin.
 */
import { prisma } from "../src/lib/db";
import { slugify } from "../src/lib/content/slug";
import { sanitizeRichText, stripToText } from "../src/lib/security/sanitize";

const CATEGORIES = [
  {
    slug: "ielts",
    name: "IELTS",
    description: "Luyện thi IELTS: đề, kỹ năng và kinh nghiệm làm bài.",
  },
  {
    slug: "ngu-phap",
    name: "Ngữ pháp",
    description: "Giải thích các thì và cấu trúc bằng ví dụ dễ nhớ.",
  },
  { slug: "tu-vung", name: "Từ vựng", description: "Từ vựng theo chủ đề và cách ghi nhớ lâu." },
  {
    slug: "meo-hoc",
    name: "Mẹo học",
    description: "Phương pháp học hiệu quả cho người tự học và người đi học.",
  },
  { slug: "tin-tuc", name: "Tin trung tâm", description: "Lịch khai giảng, sự kiện và thông báo." },
];

/** Every post uses this shape, so the posts read the same way. */
type Article = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  intro: string;
  sections: { heading: string; paragraphs: string[] }[];
  conclusion: string;
  day: string;
};

const ARTICLES: Article[] = [
  {
    slug: "ielts-writing-task-2-mo-bai",
    title: "IELTS Writing Task 2: cách viết mở bài trong 3 câu",
    excerpt:
      "Một cấu trúc mở bài gồm ba câu giúp bạn trả lời đề rõ ràng và tiết kiệm thời gian trong phòng thi.",
    category: "ielts",
    tags: ["IELTS", "Writing", "Mở bài"],
    intro:
      "Mở bài tốt cho Task 2 cần làm đủ ba việc: diễn đạt lại đề, nêu quan điểm và báo trước hai luận điểm.",
    sections: [
      {
        heading: "Câu 1: diễn đạt lại đề",
        paragraphs: [
          "Viết lại vấn đề bằng từ khác, không sao chép nguyên câu hỏi. Giám khảo muốn thấy bạn hiểu đề.",
        ],
      },
      {
        heading: "Câu 2: nêu quan điểm",
        paragraphs: [
          "Quan điểm phải rõ ràng ngay từ đầu. Tránh viết vòng vo kiểu 'có cả ưu và nhược điểm' nếu đề yêu cầu bạn chọn một phía.",
        ],
      },
      {
        heading: "Câu 3: báo trước luận điểm",
        paragraphs: [
          "Nêu hai lý do sẽ triển khai ở thân bài. Mỗi lý do tương ứng với một đoạn thân bài.",
        ],
      },
    ],
    conclusion:
      "Ba câu mở bài là đủ. Luyện viết mở bài cho mười đề khác nhau trước khi làm bài thi thật.",
    day: "2026-09-01",
  },
  {
    slug: "5-thoi-quen-hoc-tieng-anh-moi-ngay",
    title: "5 thói quen học tiếng Anh mỗi ngày mà không cần nhiều thời gian",
    excerpt:
      "Năm thói quen nhỏ, mỗi cái chỉ vài phút, giúp bạn giữ tiếng Anh xuyên suốt mà không bị quá tải.",
    category: "meo-hoc",
    tags: ["Thói quen", "Tự học"],
    intro:
      "Học đều đặn quan trọng hơn học dài một lần. Dưới đây là năm thói quen bạn có thể làm trong mười lăm phút mỗi ngày.",
    sections: [
      {
        heading: "1. Nghe một đoạn ngắn khi đi đường",
        paragraphs: [
          "Chọn podcast khoảng năm phút. Nghe một lần không cần hiểu hết, lần thứ hai thì nghe và đọc theo.",
        ],
      },
      {
        heading: "2. Ghi ba từ mới vào sổ",
        paragraphs: [
          "Ghi từ kèm một câu ví dụ mà bạn tự viết. Câu ví dụ giúp nhớ từ lâu hơn danh sách từ đơn lẻ.",
        ],
      },
      {
        heading: "3. Viết một câu về ngày hôm nay",
        paragraphs: [
          "Một câu đơn giản mỗi tối đủ để duy trì thói quen viết. Dần dần câu sẽ dài hơn.",
        ],
      },
    ],
    conclusion:
      "Chọn hai thói quen dễ làm nhất và bắt đầu từ tuần này. Khi quen rồi mới thêm thói quen khác.",
    day: "2026-09-05",
  },
  {
    slug: "present-perfect-va-past-simple",
    title: "Phân biệt Present Perfect và Past Simple qua ví dụ",
    excerpt: "Hai thì dễ nhầm lẫn nhất. Bài này dùng ví dụ thật để bạn thấy khi nào dùng thì nào.",
    category: "ngu-phap",
    tags: ["Ngữ pháp", "Thì"],
    intro:
      "Điểm khác nhau nằm ở chỗ: Past Simple nói về thời điểm đã kết thúc, còn Present Perfect nối quá khứ với hiện tại.",
    sections: [
      {
        heading: "Past Simple: thời điểm xác định",
        paragraphs: [
          "Ví dụ: 'I visited Da Nang in 2024.' Có mốc thời gian rõ ràng, sự việc đã kết thúc.",
        ],
      },
      {
        heading: "Present Perfect: kết quả còn đến bây giờ",
        paragraphs: [
          "Ví dụ: 'I have visited Da Nang three times.' Không nói khi nào, chỉ nhấn mạnh trải nghiệm đến nay.",
        ],
      },
    ],
    conclusion:
      "Hỏi bản thân: có mốc thời gian không? Nếu có, dùng Past Simple. Nếu không, Present Perfect thường phù hợp.",
    day: "2026-09-10",
  },
  {
    slug: "30-tu-vung-chu-de-cong-viec",
    title: "30 từ vựng tiếng Anh về công việc văn phòng",
    excerpt: "Danh sách từ vựng về họp, báo cáo và email, kèm cách dùng trong câu thực tế.",
    category: "tu-vung",
    tags: ["Từ vựng", "Công việc"],
    intro:
      "Từ vựng văn phòng xuất hiện nhiều nhất trong họp và email. Học theo nhóm chủ đề giúp nhớ nhanh hơn.",
    sections: [
      {
        heading: "Nhóm 1: họp và thảo luận",
        paragraphs: [
          "Agenda, minutes, follow up, action item. Mỗi từ kèm một câu bạn có thể dùng ngay khi họp.",
        ],
      },
      {
        heading: "Nhóm 2: email và báo cáo",
        paragraphs: [
          "Attachment, deadline, reminder, summary. Đây là nhóm dùng nhiều nhất trong công việc hằng ngày.",
        ],
      },
    ],
    conclusion:
      "Chọn sáu từ mỗi tuần, dùng trong một email thật. Viết ra là cách học hiệu quả nhất.",
    day: "2026-09-14",
  },
  {
    slug: "luyen-noi-ielts-speaking-part-2",
    title: "IELTS Speaking Part 2: cách trả lời đủ hai phút",
    excerpt: "Cấu trúc bốn ý để nói đủ thời gian mà không bị bí ý ở giữa chừng.",
    category: "ielts",
    tags: ["IELTS", "Speaking"],
    intro:
      "Part 2 yêu cầu nói khoảng hai phút về một chủ đề cho sẵn. Bạn chỉ cần một dàn ý bốn ý để không bị lạc.",
    sections: [
      {
        heading: "Ý 1: giới thiệu đối tượng",
        paragraphs: ["Nói bạn đang kể về điều gì và trong hoàn cảnh nào."],
      },
      {
        heading: "Ý 2 và ý 3: chi tiết",
        paragraphs: ["Hai ý này là phần dài nhất. Mỗi ý kèm một ví dụ cụ thể để tăng độ tự nhiên."],
      },
      {
        heading: "Ý 4: cảm xúc hoặc kết luận",
        paragraphs: [
          "Kết thúc bằng cảm xúc của bạn về điều đó. Giám khảo thường đánh giá cao phần này.",
        ],
      },
    ],
    conclusion: "Luyện nói một đề mỗi ngày, ghi âm và nghe lại. Bạn sẽ thấy rõ chỗ cần sửa.",
    day: "2026-09-18",
  },
  {
    slug: "lich-khai-giang-thang-10",
    title: "Lịch khai giảng tháng 10: các lớp còn chỗ",
    excerpt: "Danh sách lớp khai giảng trong tháng, số chỗ còn lại và cách đăng ký giữ chỗ.",
    category: "tin-tuc",
    tags: ["Khai giảng", "Thông báo"],
    intro:
      "Tháng 10 có thêm lớp luyện thi buổi tối và lớp giao tiếp cuối tuần. Số chỗ mỗi lớp có hạn.",
    sections: [
      {
        heading: "Lớp đang nhận đăng ký",
        paragraphs: [
          "Luyện thi IELTS buổi tối, giao tiếp cuối tuần và tiếng Anh thiếu nhi. Lịch cụ thể xem tại trang khoá học.",
        ],
      },
      {
        heading: "Cách giữ chỗ",
        paragraphs: ["Đăng ký buổi học thử miễn phí, sau đó đóng phí trong ba ngày để giữ chỗ."],
      },
    ],
    conclusion: "Liên hệ sớm để được xếp lớp đúng trình độ và lịch học.",
    day: "2026-09-22",
  },
];

function bodyOf(article: Article) {
  const parts = [`<p>${article.intro}</p>`];
  for (const section of article.sections) {
    parts.push(`<h2>${section.heading}</h2>`);
    for (const paragraph of section.paragraphs) parts.push(`<p>${paragraph}</p>`);
  }
  parts.push("<h2>Kết luận</h2>", `<p>${article.conclusion}</p>`);
  return sanitizeRichText(parts.join(""));
}

async function main() {
  const author = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!author) throw new Error("No administrator yet. Run npm run db:seed first.");

  const categoryIds = new Map<string, string>();
  for (const c of CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: { slug: c.slug, name: c.name, description: c.description },
    });
    categoryIds.set(c.slug, row.id);
  }
  console.log(`Categories ready: ${CATEGORIES.length}`);

  let created = 0;
  for (const a of ARTICLES) {
    if (await prisma.post.findUnique({ where: { slug: a.slug } })) continue;
    const body = bodyOf(a);
    const tagIds: string[] = [];
    for (const name of a.tags) {
      const tag = await prisma.tag.upsert({
        where: { slug: slugify(name) },
        update: {},
        create: { name, slug: slugify(name) },
      });
      tagIds.push(tag.id);
    }
    await prisma.post.create({
      data: {
        slug: a.slug,
        title: a.title,
        excerpt: a.excerpt || stripToText(body, 160),
        body,
        status: "published",
        publishedAt: new Date(`${a.day}T08:00:00+07:00`),
        authorId: author.id,
        categories: { create: [{ categoryId: categoryIds.get(a.category)! }] },
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
      },
    });
    created++;
  }
  console.log(`Posts created: ${created} (existing slugs were left alone)`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
