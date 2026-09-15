#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Pixory / nano-banana 服务器磁盘占用诊断脚本
#
# 用途：定位 23.141.172.73 上究竟是什么占满了磁盘，以及最近新增了什么。
# 特性：**全程只读**，不删除、不移动、不修改任何文件。
#
# 用法（在服务器终端里执行）：
#   bash disk-audit.sh
# ─────────────────────────────────────────────────────────────────────

PROJECT="/var/www/nano-banana"

hr() { printf '\n\033[1;36m%s\033[0m\n' "===== $* ====="; }

hr "1. 磁盘总览 (df)"
df -h -x tmpfs -x devtmpfs -x overlay 2>/dev/null

hr "2. 根目录顶层占用 TOP 15"
du -x -h --max-depth=1 / 2>/dev/null | sort -hr | head -15

hr "3. 关键系统目录大小"
for d in /var/www /www /var/log /tmp /root /usr /var/lib /var/cache /home /opt; do
  [ -d "$d" ] && du -sh "$d" 2>/dev/null
done | sort -hr

hr "3b. /var 与 /www 二级明细（找隐藏的大头）"
echo "--- /var ---"
du -x -h --max-depth=1 /var 2>/dev/null | sort -hr | head -15
echo "--- /www ---"
du -x -h --max-depth=1 /www 2>/dev/null | sort -hr | head -12

hr "3c. core dump 检查（项目里出现未知的 core 就是它）"
printf 'core_pattern = %s\n' "$(cat /proc/sys/kernel/core_pattern 2>/dev/null)"
ls -la "$PROJECT/core" 2>/dev/null | head -20
du -ah "$PROJECT/core" 2>/dev/null | sort -hr | head -15
echo "--- 全盘搜 core 转储文件（> 10MB）---"
find / -xdev \( -name 'core' -o -name 'core.[0-9]*' -o -name '*.core' \) \
  -type f -size +10M -printf '%s\t%TY-%Tm-%Td %TH:%TM\t%p\n' 2>/dev/null \
  | sort -nr | head -15 | awk -F'\t' '{printf "%8.1f MB  %s  %s\n", $1/1048576, $2, $3}'

hr "4. 项目目录内部占用 TOP 20 ($PROJECT)"
if [ -d "$PROJECT" ]; then
  du -sh "$PROJECT"/.[!.]* "$PROJECT"/* 2>/dev/null | sort -hr | head -20
else
  echo "找不到 $PROJECT"
fi

hr "5. 图片 / 数据库 / 部署产物明细"
du -sh \
  "$PROJECT"/uploads \
  "$PROJECT"/uploads/generated \
  "$PROJECT"/uploads/thumbnails \
  "$PROJECT"/uploads/references \
  "$PROJECT"/data \
  "$PROJECT"/data/sqlite-backups \
  "$PROJECT"/.deploy-backups \
  "$PROJECT"/.deploy-incoming \
  "$PROJECT"/node_modules \
  2>/dev/null | sort -hr

echo "--- 各目录文件数 ---"
for rel in uploads/generated uploads/thumbnails uploads/references data/sqlite-backups; do
  p="$PROJECT/$rel"
  if [ -d "$p" ]; then
    printf '%-26s %8s 个文件\n' "$rel" "$(find "$p" -type f 2>/dev/null | wc -l)"
  fi
done

echo "--- data 目录内容 ---"
ls -lhS "$PROJECT/data" 2>/dev/null | head -10

hr "6. pm2 日志（重点嫌疑）"
du -sh /root/.pm2 /root/.pm2/logs 2>/dev/null
echo "--- 按大小排序的日志文件 ---"
ls -lhS /root/.pm2/logs 2>/dev/null | head -12
echo "--- pm2 进程列表 ---"
pm2 list 2>/dev/null | head -12 || echo "pm2 不可用"

hr "7. 缓存 / 临时文件"
du -sh /root/.npm /root/.cache /root/.acme.sh /tmp /var/cache /var/tmp 2>/dev/null | sort -hr
echo "--- /tmp 里大于 10MB 的文件 ---"
find /tmp -type f -size +10M -printf '%s\t%TY-%Tm-%Td %TH:%TM\t%p\n' 2>/dev/null \
  | sort -nr | head -10 | awk -F'\t' '{printf "%8.1f MB  %s  %s\n", $1/1048576, $2, $3}'

hr "8. nginx / 宝塔面板 日志"
du -sh /www/wwwlogs /www/server /www/server/data 2>/dev/null | sort -hr
echo "--- web 日志按大小排序 ---"
ls -lhS /www/wwwlogs 2>/dev/null | head -10

hr "9. 系统日志"
du -sh /var/log/journal 2>/dev/null
journalctl --disk-usage 2>/dev/null || true
ls -lhS /var/log 2>/dev/null | head -8

hr "10. 交换文件"
ls -lh /swapfile 2>/dev/null
swapon --show 2>/dev/null || true

hr "11. 已删除但仍被进程占用的文件（df 满但 du 对不上的元凶）"
if command -v lsof >/dev/null 2>&1; then
  lsof +L1 2>/dev/null | awk 'NR==1 || $7+0 > 10485760' | head -20
else
  echo "lsof 未安装，改用 /proc 扫描："
  for fd in /proc/[0-9]*/fd/*; do
    target=$(readlink "$fd" 2>/dev/null)
    case "$target" in
      *"(deleted)"*)
        size=$(stat -Lc %s "$fd" 2>/dev/null || echo 0)
        if [ "$size" -gt 10485760 ] 2>/dev/null; then
          pid=$(echo "$fd" | cut -d/ -f3)
          printf '%8.1f MB  pid=%s  %s  (%s)\n' \
            "$(awk -v s="$size" 'BEGIN{print s/1048576}')" \
            "$pid" "$target" "$(tr -d '\0' < /proc/$pid/comm 2>/dev/null)"
        fi
        ;;
    esac
  done | sort -hr | head -20
fi

hr "12. 全盘最大的 25 个文件（> 50MB）"
find / -xdev -type f -size +50M -printf '%s\t%TY-%Tm-%Td\t%p\n' 2>/dev/null \
  | sort -nr | head -25 | awk -F'\t' '{printf "%8.1f MB  %s  %s\n", $1/1048576, $2, $3}'

hr "13. 最近 7 天新增/改动的文件（> 10MB）TOP 40"
find / -xdev -type f -mtime -7 -size +10M -printf '%s\t%TY-%Tm-%Td %TH:%TM\t%p\n' 2>/dev/null \
  | sort -nr | head -40 | awk -F'\t' '{printf "%8.1f MB  %s  %s\n", $1/1048576, $2, $3}'

hr "14. 最近 30 天新增/改动文件按目录汇总（> 20MB）"
find / -xdev -type f -mtime -30 -size +20M -printf '%s\t%p\n' 2>/dev/null \
  | awk -F'\t' '{n=split($2,a,"/"); key="/"a[2]"/"a[3]; s[key]+=$1} END {for (k in s) printf "%8.1f MB  %s\n", s[k]/1048576, k}' \
  | sort -nr | head -20

hr "15. 应用自身记录的存储 & 磁盘水位"
curl -fsS --max-time 10 http://127.0.0.1:3001/api/health 2>/dev/null || echo "本地 API 无响应"
echo

hr "16. 最近的磁盘/清理相关日志"
grep -iE 'disk-usage|disk-emergency|image-cleanup' /root/.pm2/logs/nano-banana-*.log 2>/dev/null | tail -20 || echo "无匹配"

hr "17. 部署历史"
ls -lhS "$PROJECT/.deploy-backups" 2>/dev/null | head -8
echo "--- 部署日志尾部 ---"
tail -20 /tmp/nano-banana-deploy.log 2>/dev/null || echo "无部署日志"

hr "18. docker（如果装了）"
if command -v docker >/dev/null 2>&1; then
  docker system df 2>/dev/null || echo "docker 查询失败"
else
  echo "未安装 docker"
fi

hr "诊断完成 —— 以上全部为只读操作，未修改任何文件"
