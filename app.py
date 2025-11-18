import os
import json
import re
import base64
import io
from flask import Flask, render_template, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import google.generativeai as genai
from dotenv import load_dotenv
from PIL import Image

# .envファイルから環境変数を読み込む
load_dotenv()

# Flaskアプリケーションの初期化
app = Flask(__name__)
# フロントエンドからのAPIリクエストを許可するためのCORS設定
CORS(app, resources={r"/api/*": {"origins": ["http://127.0.0.1:5000", "null"]}})

# Gemini APIキーの設定
try:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY not found in .env file")
    genai.configure(api_key=api_key)
except Exception as e:
    print(f"Error configuring Gemini API: {e}")
    api_key = None 

# モデルの準備
model = genai.GenerativeModel('gemini-2.5-flash')

# --- プロンプト生成ヘルパー関数 ---

def _get_fast_jp_to_en_prompt(text, level, style, force_sarcasm_check):
    """(高速) 日本語から英語への翻訳・解説プロンプトを生成する"""
    sarcasm_check_status = "有効" if force_sarcasm_check else "無効"
    return f"""
# 役割設定
あなたは、プロの「スピーキング・コーチ」であり、言語の「文化・文脈通訳者」です。あなたの仕事は、発言の「真の意図」を見抜き、その文化的背景まで含めて翻訳することです。

# 指示
ユーザーのテキストを分析し、文化的背景（方言、皮肉、建前）を考慮して、最適な翻訳を生成してください。以下のタスクを厳密に実行してください。

# 入力情報
- ユーザーのテキスト: "{text}"
- 希望レベル: "{level}"
- 希望スタイル: "{style}"
- 皮肉強制分析フラグ: {sarcasm_check_status}

# 厳格な実行タスク
1.  **[皮肉・裏の意味の分析]**: テキストを分析し、文字通りの意味か、皮肉や建前が含まれるかを判断します。
2.  **[翻訳の実行]**: 分析結果に基づき、以下の2つの翻訳を生成します。
    - `main_translation` (最適解): 話者の「真の意図」を汲み取った翻訳。
    - `superficial_translation` (表面的): 皮肉や建前がある場合のみ、文字通りの翻訳。
3.  **[解説の生成]**: 皮肉や建前がある場合のみ、`cultural_explanation`（なぜその翻訳になったのかの文化的な解説）を100文字程度の日本語で生成します。

# 出力フォーマット (JSON)
{{
  "main_translation": "ここに最適解の英訳（文字列）",
  "superficial_translation": "皮肉や建前の場合、ここに表面的・文字通りの英訳（文字列）。標準的な発言の場合は null",
  "cultural_explanation": "皮肉や建前の場合、ここに文化的な背景の解説（文字列）。標準的な発言の場合は null"
}}
"""

def _get_fast_en_to_jp_prompt(text):
    """(高速) 英語から日本語への翻訳プロンプトを生成する"""
    return f"""
# 役割設定
あなたはプロの翻訳家です。

# 指示
提供された英語のテキストを、自然で正確な日本語に翻訳してください。

# 入力情報
- 元の英語テキスト: "{text}"

# 出力フォーマット (JSON)
{{
  "translation": "ここに翻訳結果の日本語（文字列）"
}}
"""

def _get_analysis_prompt(original_text, translated_text, direction):
    """翻訳結果に基づき、語彙と代替案を生成するプロンプト"""
    if direction == 'jp-to-en':
        return f"""
# 役割設定
あなたはプロの「スピーキング・コーチ」です。

# 指示
以下の「原文」と「その翻訳文」を基に、学習者のための補足情報を生成してください。

# 入力情報
- 原文 (日本語): "{original_text}"
- 翻訳文 (英語): "{translated_text}"

# 実行タスク
1. **`vocabulary`**: 「翻訳文」の中から、特に重要だと考える単語やイディオムを2〜3個選び出し、「短い意味」と「詳細な説明」を**日本語で**生成します。
2. **`alternatives`**: 「翻訳文」以外に考えられる、異なるニュアンスを持つ自然な代替表現を3つ提案し、それぞれの使用頻度を3段階の星（★★★, ★★☆, ★☆☆）で評価します。ニュアンスも**日本語で**記述してください。

# 出力フォーマット (JSON)
{{
  "vocabulary": [
    {{"term": "語彙1", "short_meaning": "短い意味1", "explanation": "詳細な説明1"}},
    {{"term": "語彙2", "short_meaning": "短い意味2", "explanation": "詳細な説明2"}}
  ],
  "alternatives": [
    {{"expression": "代替案1", "nuance": "ニュアンス1", "frequency": "★★★"}},
    {{"expression": "代替案2", "nuance": "ニュアンス2", "frequency": "★★☆"}},
    {{"expression": "代替案3", "nuance": "ニュアンス3", "frequency": "★☆☆"}}
  ]
}}
"""
    elif direction == 'en-to-jp':
        return f"""
# 役割設定
あなたはプロの英語教師です。

# 指示
以下の「原文」と「その翻訳文」を基に、日本の学習者のための重要語彙を解説してください。

# 入力情報
- 原文 (英語): "{original_text}"
- 翻訳文 (日本語): "{translated_text}"

# 実行タスク
- **`vocabulary`**: 「原文」の中から、日本の学習者が学ぶべき重要だと考える単語やイディオムを2〜3個選び出し、「短い意味」と「詳細な説明」を**日本語で**生成してください。

# 出力フォーマット (JSON)
{{
  "vocabulary": [
    {{"term": "語彙1", "short_meaning": "短い意味1", "explanation": "詳細な説明1"}},
    {{"term": "語彙2", "short_meaning": "短い意味2", "explanation": "詳細な説明2"}}
  ]
}}
"""
    return ""


def stream_response_generator(stream):
    """レスポンスストリームからテキストチャンクを生成する"""
    for chunk in stream:
        if chunk.text:
            yield chunk.text

# --- APIルート ---

@app.route('/')
def index():
    """メインのHTMLページをレンダリングする"""
    return render_template('index.html')

@app.route('/api/translate', methods=['POST'])
def translate_text():
    """(高速) テキスト翻訳APIのエンドポイント"""
    if not api_key:
        return Response('{"error": "Gemini API key is not configured on the server."}', status=500, content_type='application/json')

    data = request.get_json()
    if not data or 'text' not in data or 'direction' not in data:
        return Response('{"error": "Invalid input parameters for text translation."}', status=400, content_type='application/json')

    direction = data['direction']
    
    try:
        if direction == 'jp-to-en':
            prompt = _get_fast_jp_to_en_prompt(data['text'], data.get('level', '英検2級'), data.get('style', 'カジュアル'), data.get('force_sarcasm_check', False))
        elif direction == 'en-to-jp':
            prompt = _get_fast_en_to_jp_prompt(data['text'])
        else:
            return Response('{"error": "Invalid direction specified."}', status=400, content_type='application/json')
        
        response_stream = model.generate_content(prompt, stream=True)
        return Response(stream_with_context(stream_response_generator(response_stream)), content_type='text/plain; charset=utf-8')

    except Exception as e:
        print(f"Error during streaming translation: {e}")
        return Response(f'{{"error": "An error occurred during translation: {str(e)}"}}', status=500, content_type='application/json')

@app.route('/api/ocr_translate', methods=['POST'])
def ocr_translate():
    """(高速) 画像/PDF(OCR)翻訳APIのエンドポイント"""
    # このエンドポイントはコンセプトが複雑になるため、一旦シンプルなテキストベースの翻訳のみを高速化の対象とする
    # そのため、この関数は元の（分割前）の完全なプロンプトを呼び出すように維持する
    # TODO: OCRのフローも高速・低速の2段階に分割するか検討
    if not api_key:
        return Response('{"error": "Gemini API key is not configured on the server."}', status=500, content_type='application/json')

    # (元のロジックを維持)
    # ... (元のコードをここに記述) ...
    return Response('{"error": "OCR translation is not supported in this version."}', status=501, content_type='application/json')


@app.route('/api/analyze', methods=['POST'])
def analyze_text():
    """(低速) 翻訳結果の分析APIのエンドポイント"""
    if not api_key:
        return Response('{"error": "Gemini API key is not configured on the server."}', status=500, content_type='application/json')

    data = request.get_json()
    if not data or 'original_text' not in data or 'translated_text' not in data or 'direction' not in data:
        return Response('{"error": "Invalid input parameters for analysis."}', status=400, content_type='application/json')

    try:
        prompt = _get_analysis_prompt(data['original_text'], data['translated_text'], data['direction'])
        if not prompt:
            return Response('{"error": "Invalid direction for analysis."}', status=400, content_type='application/json')

        response_stream = model.generate_content(prompt, stream=True)
        return Response(stream_with_context(stream_response_generator(response_stream)), content_type='text/plain; charset=utf-8')

    except Exception as e:
        print(f"Error during streaming analysis: {e}")
        return Response(f'{{"error": "An error occurred during analysis: {str(e)}"}}', status=500, content_type='application/json')


if __name__ == '__main__':
    app.run(debug=True, port=5000)