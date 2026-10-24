#!/usr/bin/env bash
# Webmantle Docker CLI: build, run and manage the site in Docker.
# Usage: scripts/webmantle.sh <command>   (or: npm run docker -- <command>)
set -euo pipefail

cd "$(dirname "$0")/.."

SERVICE=web
CONTAINER=webmantle
VOLUME_SUFFIX=webmantle-data

say() { printf '%s\n' "$*"; }
die() { printf 'Lỗi: %s\n' "$*" >&2; exit 1; }

need_docker() {
  command -v docker >/dev/null 2>&1 || die "Chưa cài Docker. Tải Docker Desktop tại https://www.docker.com/products/docker-desktop"
  docker info >/dev/null 2>&1 || die "Docker chưa chạy. Hãy mở Docker Desktop rồi thử lại."
  docker compose version >/dev/null 2>&1 || die "Thiếu plugin Docker Compose (cần Docker 24 trở lên)."
}

need_env() {
  [ -f .env ] || die "Chưa có file .env. Chạy trước: scripts/webmantle.sh init"
}

dc() { docker compose "$@"; }

# Reads the value of KEY from .env (without quotes), or the default.
env_value() {
  local key="$1" fallback="${2:-}" line
  line=$(grep -E "^${key}=" .env 2>/dev/null | tail -1 || true)
  line="${line#*=}"
  line="${line%\"}"
  line="${line#\"}"
  printf '%s' "${line:-$fallback}"
}

set_env() {
  local key="$1" value="$2" tmp
  tmp=$(mktemp)
  grep -v -E "^${key}=" .env >"$tmp" || true
  printf '%s="%s"\n' "$key" "$value" >>"$tmp"
  cat "$tmp" >.env
  rm -f "$tmp"
  chmod 600 .env
}

port() { env_value WEB_PORT 3000; }

wait_ready() {
  local url="http://localhost:$(port)/login" i
  say "Đang chờ website khởi động..."
  for i in $(seq 1 60); do
    if curl -fsS -o /dev/null "$url" 2>/dev/null; then
      say "Sẵn sàng: http://localhost:$(port)"
      return 0
    fi
    sleep 2
  done
  say "Website chưa phản hồi sau 2 phút. Xem log: scripts/webmantle.sh logs"
  return 1
}

# Runs a TypeScript snippet inside the running container with the given env pairs.
run_ts() {
  local code="$1"
  shift
  dc exec -T "$@" "$SERVICE" sh -c 'cat > /tmp/wm.ts && npx tsx /tmp/wm.ts; code=$?; rm -f /tmp/wm.ts; exit $code' <<<"$code"
}

ask_password() {
  local label="$1" a b
  while true; do
    read -r -s -p "${label}: " a
    echo
    read -r -s -p "Nhập lại mật khẩu: " b
    echo
    [ "$a" = "$b" ] && [ -n "$a" ] && { REPLY_PASSWORD="$a"; return; }
    say "Hai lần nhập không khớp hoặc để trống, thử lại."
  done
}

cmd_init() {
  need_docker
  if [ -f .env ]; then
    say "Đã có file .env, giữ nguyên. Sửa trực tiếp nếu cần."
    return
  fi
  cp .env.example .env
  chmod 600 .env
  set_env PREVIEW_SECRET "$(openssl rand -base64 48 | tr -d '\n')"
  read -r -p "Địa chỉ website [http://localhost:3000]: " site
  set_env SITE_URL "${site:-http://localhost:3000}"
  read -r -p "Email quản trị: " email
  [ -n "$email" ] || die "Cần nhập email quản trị."
  set_env ADMIN_EMAIL "$email"
  while true; do
    ask_password "Mật khẩu quản trị (từ 12 ký tự)"
    [ "${#REPLY_PASSWORD}" -ge 12 ] && break
    say "Mật khẩu phải có ít nhất 12 ký tự."
  done
  set_env ADMIN_PASSWORD "$REPLY_PASSWORD"
  say "Đã tạo .env (quyền 600). Bước tiếp theo: scripts/webmantle.sh up"
}

cmd_build() {
  need_docker
  need_env
  dc build
}

cmd_up() {
  need_docker
  need_env
  dc up -d --build
  wait_ready
}

cmd_down() {
  need_docker
  dc down
  say "Đã dừng và gỡ container. Dữ liệu trong volume vẫn còn."
}

cmd_stop() { need_docker; dc stop; }
cmd_start() { need_docker; dc start; wait_ready; }
cmd_restart() { need_docker; dc restart; wait_ready; }
cmd_logs() { need_docker; dc logs -f --tail=100 "$SERVICE"; }

cmd_status() {
  need_docker
  dc ps
  docker stats --no-stream "$CONTAINER" 2>/dev/null || true
}

cmd_shell() { need_docker; dc exec "$SERVICE" sh; }

cmd_create_admin() {
  need_docker
  local email="${1:-}"
  [ -n "$email" ] || read -r -p "Email: " email
  [ -n "$email" ] || die "Cần có email."
  local pw="${WM_PASSWORD:-}"
  if [ -z "$pw" ]; then
    ask_password "Mật khẩu"
    pw="$REPLY_PASSWORD"
  fi
  [ "${#pw}" -ge 12 ] || say "Cảnh báo: mật khẩu dưới 12 ký tự, nên dùng mật khẩu dài hơn."
  upsert_user "$email" "$pw" admin "Admin"
}

cmd_create_demo() {
  need_docker
  local email="${1:-demo@mail.com}"
  local pw="${WM_PASSWORD:-}"
  if [ -z "$pw" ]; then
    ask_password "Mật khẩu tài khoản Demo"
    pw="$REPLY_PASSWORD"
  fi
  upsert_user "$email" "$pw" viewer "Demo"
  say "Tài khoản Demo chỉ xem được. Muốn bật nút /demo, đặt DEMO_PUBLIC_LOGIN=\"true\" và DEMO_EMAIL trong .env rồi chạy: scripts/webmantle.sh restart"
}

upsert_user() {
  local email="$1" pw="$2" role="$3" name="$4"
  run_ts '
import { prisma } from "/app/src/lib/db";
import { hashPassword } from "/app/src/lib/auth/password";
(async () => {
  const email = process.env.WM_EMAIL!.trim().toLowerCase();
  const passwordHash = await hashPassword(process.env.WM_PW!);
  const role = process.env.WM_ROLE!;
  const u = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role },
    create: { email, name: process.env.WM_NAME!, role, passwordHash },
  });
  console.log("Xong:", u.email, "(" + u.role + ")");
  process.exit(0);
})();
' -e "WM_EMAIL=$email" -e "WM_PW=$pw" -e "WM_ROLE=$role" -e "WM_NAME=$name"
}

cmd_backup() {
  need_docker
  dc exec "$SERVICE" npm run db:backup
  local out="backups-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$out"
  docker cp "$CONTAINER:/app/data/backups/." "$out/"
  say "Đã chép các bản sao lưu ra thư mục: $out"
}

cmd_update() {
  need_docker
  need_env
  say "Nên sao lưu trước khi nâng cấp (scripts/webmantle.sh backup)."
  dc up -d --build
  wait_ready
}

cmd_reset() {
  need_docker
  say "CẢNH BÁO: lệnh này xóa container và TOÀN BỘ dữ liệu (cơ sở dữ liệu, ảnh, giao diện, sao lưu trong volume)."
  read -r -p "Gõ XOA để xác nhận: " ok
  [ "$ok" = "XOA" ] || die "Đã hủy."
  dc down -v
  say "Đã xóa. Chạy lại: scripts/webmantle.sh up"
}

cmd_help() {
  cat <<'EOF'
Webmantle Docker CLI

Cách dùng: scripts/webmantle.sh <lệnh>      (hoặc: npm run docker -- <lệnh>)

Cài đặt và chạy
  init                 Tạo file .env (hỏi địa chỉ site, email và mật khẩu quản trị)
  build                Chỉ build image
  up                   Build (nếu cần) và chạy website ở nền
  update               Build lại và khởi động lại bằng bản mới, giữ nguyên dữ liệu

Quản lý
  status               Xem trạng thái và mức dùng bộ nhớ
  logs                 Xem log trực tiếp (Ctrl+C để thoát)
  start | stop | restart
  down                 Dừng và gỡ container (giữ dữ liệu)
  shell                Mở shell trong container

Tài khoản
  create-admin [email] Tạo hoặc đặt lại tài khoản quản trị (hỏi mật khẩu)
  create-demo [email]  Tạo hoặc đặt lại tài khoản Demo chỉ xem (mặc định demo@mail.com)

Dữ liệu
  backup               Sao lưu và chép ra thư mục backups-<ngày giờ>
  reset                Xóa container và toàn bộ dữ liệu (cần xác nhận)

Biến tùy chọn trong .env
  WEB_PORT=3000        Cổng mở ra máy chủ
  WEB_MEMORY=1g        Giới hạn bộ nhớ của container
EOF
}

command_name="${1:-help}"
shift || true
case "$command_name" in
  init) cmd_init ;;
  build) cmd_build ;;
  up) cmd_up ;;
  update) cmd_update ;;
  down) cmd_down ;;
  stop) cmd_stop ;;
  start) cmd_start ;;
  restart) cmd_restart ;;
  logs) cmd_logs ;;
  status) cmd_status ;;
  shell) cmd_shell ;;
  create-admin) cmd_create_admin "$@" ;;
  create-demo) cmd_create_demo "$@" ;;
  backup) cmd_backup ;;
  reset) cmd_reset ;;
  help|-h|--help) cmd_help ;;
  *) say "Lệnh không có: $command_name"; echo; cmd_help; exit 1 ;;
esac
