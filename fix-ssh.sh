#!/bin/bash
# ============================================================
# 一键修复 SSH 端口并重启服务
# 用法：通过 VNC 控制台登录后，粘贴执行
# ============================================================

set -e

echo "========================================"
echo "  SSH 端口修复脚本"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
echo ""

# ---------- 1. 检查 SSH 服务状态 ----------
echo "[1/7] 检查 SSH 服务状态..."
if systemctl is-active --quiet sshd 2>/dev/null; then
    echo "  ✅ sshd 正在运行"
elif systemctl is-active --quiet ssh 2>/dev/null; then
    echo "  ✅ ssh 正在运行"
else
    echo "  ❌ SSH 服务未运行，尝试启动..."
    systemctl start sshd 2>/dev/null || systemctl start ssh 2>/dev/null || true
fi
echo ""

# ---------- 2. 检查 SSH 配置端口 ----------
echo "[2/7] 检查 SSH 监听端口..."
SSH_PORT=$(grep -E "^Port " /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}')
if [ -z "$SSH_PORT" ]; then
    SSH_PORT=22
    echo "  端口: 22 (默认)"
else
    echo "  端口: $SSH_PORT"
fi

# 检查实际监听
LISTENING=$(ss -tlnp | grep -E "sshd|:22" || true)
if [ -n "$LISTENING" ]; then
    echo "  ✅ SSH 已在监听:"
    echo "$LISTENING" | sed 's/^/    /'
else
    echo "  ❌ SSH 未在监听任何端口"
fi
echo ""

# ---------- 3. 修复 iptables 防火墙 ----------
echo "[3/7] 检查 iptables 防火墙规则..."
BLOCKED_RULES=$(iptables -L INPUT -n 2>/dev/null | grep -E "DROP|REJECT" || true)
if [ -n "$BLOCKED_RULES" ]; then
    echo "  发现阻断规则:"
    echo "$BLOCKED_RULES" | sed 's/^/    /'
fi

# 放行 SSH 端口
iptables -C INPUT -p tcp --dport "$SSH_PORT" -j ACCEPT 2>/dev/null || {
    iptables -I INPUT 1 -p tcp --dport "$SSH_PORT" -j ACCEPT
    echo "  ✅ 已在 iptables 放行端口 $SSH_PORT"
}
# 同时放行 22 以防配置被改
if [ "$SSH_PORT" != "22" ]; then
    iptables -C INPUT -p tcp --dport 22 -j ACCEPT 2>/dev/null || {
        iptables -I INPUT 1 -p tcp --dport 22 -j ACCEPT
        echo "  ✅ 已在 iptables 放行端口 22"
    }
fi
echo ""

# ---------- 4. 修复 ufw 防火墙 ----------
echo "[4/7] 检查 ufw 防火墙..."
if command -v ufw &>/dev/null; then
    UFW_STATUS=$(ufw status 2>/dev/null || true)
    if echo "$UFW_STATUS" | grep -q "active"; then
        echo "  ufw 已启用，当前规则:"
        echo "$UFW_STATUS" | sed 's/^/    /'
        ufw allow "$SSH_PORT"/tcp 2>/dev/null || true
        echo "  ✅ 已放行端口 $SSH_PORT/tcp"
        if [ "$SSH_PORT" != "22" ]; then
            ufw allow 22/tcp 2>/dev/null || true
            echo "  ✅ 已放行端口 22/tcp"
        fi
    else
        echo "  ufw 未启用，跳过"
    fi
else
    echo "  ufw 未安装，跳过"
fi
echo ""

# ---------- 5. 检查 fail2ban ----------
echo "[5/7] 检查 fail2ban..."
if command -v fail2ban-client &>/dev/null; then
    if systemctl is-active --quiet fail2ban 2>/dev/null; then
        echo "  fail2ban 正在运行"
        BANNED=$(fail2ban-client status sshd 2>/dev/null | grep "Banned IP" || true)
        if [ -n "$BANNED" ]; then
            echo "  ⚠️ 发现被封禁的 IP:"
            echo "$BANNED" | sed 's/^/    /'
            echo "  解封所有 IP..."
            fail2ban-client unban --all 2>/dev/null || true
            echo "  ✅ 已解封所有 IP"
        else
            echo "  ✅ 没有被封禁的 IP"
        fi
    else
        echo "  fail2ban 未运行，跳过"
    fi
else
    echo "  fail2ban 未安装，跳过"
fi
echo ""

# ---------- 6. 检查宝塔面板限制 ----------
echo "[6/7] 检查宝塔面板 SSH 限制..."
if [ -f /www/server/panel/data/ssh_port.pl ]; then
    BT_SSH_PORT=$(cat /www/server/panel/data/ssh_port.pl 2>/dev/null || true)
    echo "  宝塔配置的 SSH 端口: $BT_SSH_PORT"
    if [ "$BT_SSH_PORT" != "$SSH_PORT" ]; then
        echo "  ⚠️ 宝塔端口配置与 sshd_config 不一致！"
    fi
fi

BT_FIREWALL=$(ls /www/server/panel/script/firewall.sh 2>/dev/null || true)
if [ -n "$BT_FIREWALL" ]; then
    echo "  检测到宝塔防火墙插件，尝试放行..."
    bash /www/server/panel/script/firewall.sh add "$SSH_PORT" TCP 2>/dev/null || true
    echo "  ✅ 已通过宝塔放行端口 $SSH_PORT"
    if [ "$SSH_PORT" != "22" ]; then
        bash /www/server/panel/script/firewall.sh add 22 TCP 2>/dev/null || true
        echo "  ✅ 已通过宝塔放行端口 22"
    fi
fi
echo ""

# ---------- 7. 重启 SSH 服务 ----------
echo "[7/7] 重启 SSH 服务..."
systemctl restart sshd 2>/dev/null || systemctl restart ssh 2>/dev/null || {
    echo "  ❌ SSH 重启失败，尝试重新安装配置..."
    systemctl daemon-reload
    systemctl restart sshd 2>/dev/null || systemctl restart ssh 2>/dev/null || true
}

sleep 2

# 验证
FINAL_CHECK=$(ss -tlnp | grep -E ":$SSH_PORT|:22" || true)
if [ -n "$FINAL_CHECK" ]; then
    echo "  ✅ SSH 服务已重启，端口正在监听:"
    echo "$FINAL_CHECK" | sed 's/^/    /'
else
    echo "  ❌ SSH 仍未监听，请手动检查 /etc/ssh/sshd_config"
fi
echo ""

# ---------- 最终状态汇总 ----------
echo "========================================"
echo "  修复完成，最终状态:"
echo "========================================"
echo "  SSH 配置端口: $SSH_PORT"
echo "  iptables 规则: 已放行"
if command -v ufw &>/dev/null && ufw status 2>/dev/null | grep -q "active"; then
    echo "  ufw 规则: 已放行"
fi
if command -v fail2ban-client &>/dev/null; then
    echo "  fail2ban: 已解封所有 IP"
fi
echo ""
echo "  现在可以尝试用以下命令从本地连接:"
echo "    ssh -p $SSH_PORT root@23.141.172.73"
echo ""
echo "  如果端口是 22，直接:"
echo "    ssh root@23.141.172.73"
echo "========================================"
