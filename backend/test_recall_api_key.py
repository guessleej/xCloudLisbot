#!/usr/bin/env python3
"""
Recall.ai API Key 驗證腳本
用途：確認試用 API key 是否有效
"""

import httpx
import asyncio
import sys


async def validate_recall_api_key(api_key: str) -> bool:
    """
    驗證 Recall.ai API key 有效性
    通過呼叫一個簡單端點（list bots）來測試
    """
    if not api_key:
        print("❌ API key 為空")
        return False

    headers = {
        "Authorization": api_key,  # Token prefix 可選，直接用 key
        "Content-Type": "application/json"
    }

    # 使用 list bots 端點作為簡單健康檢查
    # 如果 key 有效，應返回 200 + bots 清單（可能為空）
    url = "https://us-east-1.recall.ai/api/v1/bot/"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers)

            print(f"HTTP Status: {response.status_code}")
            print(f"Response: {response.text[:200]}")

            if response.status_code == 200:
                print("✅ API key 有效！")
                return True
            elif response.status_code == 401:
                print("❌ API key 無效或已過期（401 Unauthorized）")
                return False
            elif response.status_code == 429:
                print("⚠️  限速中（429），但 key 可能有效，稍後重試")
                return True
            else:
                print(f"⚠️  意外的狀態碼 {response.status_code}")
                return False

    except httpx.ConnectError as e:
        print(f"❌ 網路連線失敗：{e}")
        return False
    except httpx.TimeoutException:
        print("❌ 請求逾時")
        return False
    except Exception as e:
        print(f"❌ 錯誤：{e}")
        return False


async def main():
    # 從環境變數或命令列參數讀取 API key
    if len(sys.argv) > 1:
        api_key = sys.argv[1]
    else:
        # 試著從環境變數讀取
        import os
        api_key = os.getenv("RECALL_API_KEY", "")

        if not api_key:
            print("使用方法：")
            print("  python test_recall_api_key.py <YOUR_API_KEY>")
            print("或設定環境變數：")
            print("  export RECALL_API_KEY=<YOUR_API_KEY>")
            sys.exit(1)

    print(f"驗證 API key：{api_key[:10]}...{api_key[-5:]}")
    print("-" * 50)

    result = await validate_recall_api_key(api_key)
    sys.exit(0 if result else 1)


if __name__ == "__main__":
    asyncio.run(main())
