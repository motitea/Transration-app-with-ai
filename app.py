import os
import json
import re
import base64
import io
from flask import Flask, render_template, request, jsonify
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

# --- ヘルパー関数 ---

def _get_jp_to_en_prompt(text, level, style):
    """日本語から英語への翻訳・解説プロンプトを生成する"""
    return f"""
# 役割設定
あなたは、日本のユーザーが作成した日本語の意図を汲み取り、ネイティブスピーカーが使う自然で洗練された英語表現に変換するプロの「英語コーチ」です。

# 指示
ユーザーから提供される「元のテキスト」「表現レベル」「スタイル」に基づき、以下のタスクを厳密に実行し、指定されたJSON形式で出力してください。

## タスク1: 最適な英訳の提案
元のテキストが持つ「本来の意図」を最優先に考慮し、不自然な直訳のクセを解消した、最も自然でプロフェッショナルな英語表現を1つだけ提案してください。
この際、以下の「表現レベル」と「スタイル」の制約を厳密に守ってください。

### 「表現レベル」に関する制約:
- **文法**: 指定されたレベルの文法構造を可能な限り使用してください。
- **単語**: 基本的にはレベルに合った単語を選択しますが、意図を正確に表現するためにどうしても必要であれば、より難しい単語を使用しても構いません。

#### レベル定義:
- **英検3級レベル**: 中学卒業程度の基本的な文法・単語で構成。
- **英検2級、高校卒業レベル, ~TOEIC 500点**: 高校で習う標準的な文法・単語で構成。
- **英検準1級、大学在学レベル, ~TOEIC 750点**: 大学レベルのやや高度な文法・語彙を使用。
- **英検1級、大学院・社会人レベル, ~TOEIC 850点**: 大学院やビジネスの場で通用する、高度で正確な語彙・文法を使用。
- **ネイティブレベル**: 専門的、あるいは非常に洗練された、ネイティブスピーカーが感心するような表現。

### 「スタイル」に関する制約:
- **フォーマル**: ビジネス文書や公式な場で使用される、丁寧で正確な表現。
- **カジュアル**: 日常会話や親しい間柄で使用される、自然で流暢な表現。

## タスク2: 重要語彙・表現の解説
タスク1であなたが提案した「最適な英訳」の中から、特に重要だと考える単語やイディオムを2〜3個選び出してください。それぞれについて、「短い意味」と「詳細な説明」を分けて生成してください。
- **短い意味**: その単語の核心的な意味を、10文字程度の非常に短い日本語で記述します。
- **詳細な説明**: その単語のニュアンスや、どのような文脈で使われるかについての詳しい説明を日本語で記述します。

## タスク3: 代替案の提示と使用頻度評価
タスク1で提案した表現以外にも考えられる、異なるニュアンスを持つ自然な代替表現を3つ提案してください。
それぞれの代替案に対して、ネイティブスピーカーが日常的に使用する頻度を以下の3段階の星（★）で評価してください。
- ★★★: 非常に頻繁に使われる
- ★★☆: よく使われる
- ★☆☆: 使われるが、少し特殊な状況や文脈で使われることが多い

# 入力情報
- 元のテキスト: "{text}"
- 表現レベル: "{level}"
- スタイル: "{style}"

# 出力フォーマット (JSON)
{{
  "main_translation": "ここにタスク1の最適解（文字列）",
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

def _get_en_to_jp_prompt(text):
    """英語から日本語への翻訳・解説プロンプトを生成する"""
    return f"""
# 役割設定
あなたは、英語のテキストを日本語に翻訳し、日本の学習者向けに解説するプロの翻訳家兼、英語教師です。

# 指示
ユーザーから提供される英語のテキストに基づき、以下の2つのタスクを厳密に実行し、指定されたJSON形式で出力してください。

## タスク1: 自然な日本語への翻訳
提供された英語のテキストを、自然で正確な日本語に翻訳してください。

## タスク2: 重要語彙・表現の解説
「元の英語テキスト」の中から、日本の学習者が学ぶべき重要だと考える単語やイディオムを2〜3個選び出してください。それぞれについて、「短い意味」と「詳細な説明」を日本語で分けて生成してください。
- **短い意味**: その単語の核心的な意味を、10文字程度の非常に短い日本語で記述します。
- **詳細な説明**: その単語のニュアンスや、どのような文脈で使われるかについての詳しい説明を日本語で記述します。

# 入力情報
- 元の英語テキスト: "{text}"

# 出力フォーマット (JSON)
{{
  "translation": "ここにタスク1の翻訳結果の日本語（文字列）",
  "vocabulary": [
    {{"term": "語彙1", "short_meaning": "短い意味1", "explanation": "詳細な説明1"}},
    {{"term": "語彙2", "short_meaning": "短い意味2", "explanation": "詳細な説明2"}}
  ]
}}
"""

def _process_gemini_response(response):
    """Gemini APIからのレスポンスを処理し、JSONまたはエラーを返す"""
    try:
        if response.prompt_feedback.block_reason:
            return jsonify({
                "error": "Request was blocked for safety reasons.",
                "details": str(response.prompt_feedback)
            }), 400
        
        cleaned_text = response.text.strip().replace('```json', '').replace('```', '').strip()
        
        if not cleaned_text:
            return jsonify({"error": "AI model returned an empty response."}), 500

        result_json = json.loads(cleaned_text)
        return jsonify(result_json)

    except json.JSONDecodeError:
        return jsonify({
            "error": "AI model returned malformed JSON.",
            "details": "The server received a response that could not be parsed as JSON.",
            "raw_response": cleaned_text
        }), 500
    except Exception as e:
        print(f"An unexpected error occurred: {type(e).__name__}: {e}")
        return jsonify({
            "error": "An unexpected error occurred on the server.",
            "details": str(e)
        }), 500

# --- APIルート ---

@app.route('/')
def index():
    """メインのHTMLページをレンダリングする"""
    return render_template('index.html')

@app.route('/api/translate', methods=['POST'])
def translate_text():
    """テキスト翻訳APIのエンドポイント"""
    if not api_key:
        return jsonify({"error": "Gemini API key is not configured on the server."}), 500

    data = request.get_json()
    if not data or 'text' not in data or 'level' not in data or 'direction' not in data or 'style' not in data:
        return jsonify({"error": "Invalid input parameters for text translation."}), 400

    direction = data['direction']
    
    if direction == 'jp-to-en':
        prompt = _get_jp_to_en_prompt(data['text'], data['level'], data['style'])
    elif direction == 'en-to-jp':
        prompt = _get_en_to_jp_prompt(data['text'])
    else:
        return jsonify({"error": "Invalid direction specified."}), 400
    
    response = model.generate_content(prompt)
    return _process_gemini_response(response)

@app.route('/api/ocr_translate', methods=['POST'])
def ocr_translate():
    """画像またはPDF(OCR)翻訳APIのエンドポイント"""
    if not api_key:
        return jsonify({"error": "Gemini API key is not configured on the server."}), 500

    data = request.get_json()
    if not data or 'file' not in data or 'mime_type' not in data or 'level' not in data or 'direction' not in data or 'style' not in data:
        return jsonify({"error": "Invalid input parameters for file translation."}), 400

    try:
        file_data_string = data['file']
        mime_type = data['mime_type']
        
        # データURLのヘッダー部分(e.g., "data:image/jpeg;base64,")を削除
        file_b64_data = re.sub(f'^data:{mime_type};base64,', '', file_data_string)
        file_bytes = base64.b64decode(file_b64_data)

        if mime_type.startswith('image/'):
            file_part = Image.open(io.BytesIO(file_bytes))
        elif mime_type == 'application/pdf':
            # Gemini APIはPDFの場合、MIMEタイプと生のバイトデータを直接受け取る
            file_part = {'mime_type': mime_type, 'data': file_bytes}
        else:
            return jsonify({"error": "Unsupported file type.", "details": f"MIME type '{mime_type}' is not supported."}), 400

    except Exception as e:
        return jsonify({"error": "Failed to decode or process file.", "details": str(e)}), 400

    direction = data['direction']
    
    # 画像/PDFからテキストを抽出し、そのテキストに基づいてプロンプトを生成するよう指示
    ocr_prompt_text = "まず、与えられたファイル（画像またはPDF）からテキストをすべて抽出してください。次に、その抽出したテキストを「元のテキスト」として、以下の指示に従ってください。\n\n---\n\n"
    
    if direction == 'jp-to-en':
        text_prompt = _get_jp_to_en_prompt("(ファイルから抽出したテキスト)", data['level'], data['style'])
    elif direction == 'en-to-jp':
        text_prompt = _get_en_to_jp_prompt("(ファイルから抽出したテキスト)")
    else:
        return jsonify({"error": "Invalid direction specified."}), 400

    # マルチモーダルプロンプトを作成
    prompt_parts = [ocr_prompt_text + text_prompt, file_part]
    
    response = model.generate_content(prompt_parts)
    return _process_gemini_response(response)

if __name__ == '__main__':
    app.run(debug=True, port=5000)