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

def _get_jp_to_en_prompt(text, level, style, force_sarcasm_check):
    """日本語から英語への翻訳・解説プロンプトを生成する"""
    return f"""
# 役割設定
あなたは、プロの「スピーキング・コーチ」であり、言語の「文化・文脈通訳者 (Cultural Interpreter)」です。あなたの仕事は、単語を翻訳することではなく、発言の**「真の意図」**を見抜き、その文化的背景（方言、皮肉、建前）まで含めて指導することです。

# 指示
ユーザーから提供される以下の「入力情報」に基づき、指定された「厳格な実行タスク」と「出力フォーマット」を厳密に守って、タスクを実行してください。

# 入力情報
- ユーザーのテキスト: "{text}"
- 希望レベル: "{level}"
- 希望スタイル: "{style}"
- 皮肉強制分析フラグ: {force_sarcasm_check}

# 厳格な実行タスク
以下のタスクを、この順序で厳密に実行してください。

## タスク1: [方言・スラングの標準語化]
ユーザーのテキストを分析します。もしそれが「方言」（京ことば、大阪弁など）や「スラング」である場合、まず内部的に「標準語」のテキストに書き換えてください。（例：「考えとくわ」→「考えておきます」） 標準語の場合は、そのままのテキストを使用します。（この標準語化されたテキストを以降のタスクで使用します）

## タスク2: [皮肉・裏の意味の分析]
タスク1で標準語化したテキストを分析し、以下のいずれかに該当するかを判断します。
- **[A] 標準的な発言**: テキストが文字通りの意味で使われている。
- **[B] 皮肉・反語**: テキストが意図とは逆の意味で使われている。（例: 大きな失敗をして「最高だね」と言う）
- **[C] 建前・裏の意味**: テキストに、文化的な背景に基づく隠された意図がある。（例: 京ことばの「考えとくわ」は、事実上の断りを意味する）

**重要**: もし入力情報の「皮肉強制分析フラグ」が `True` だった場合、テキストが [A] 標準的な発言に見えても、[B] または [C] の可能性を最大限に疑い、より深く分析してください。

## タスク3: [翻訳の実行]
タスク2の分析結果に基づいて、翻訳を実行します。

### Case 1: タスク2が [A] (標準的な発言) の場合
- **`main_translation`**: テキストを「希望レベル」と「希望スタイル」に合わせて、最も自然な英語に翻訳します。
- **`superficial_translation`**: `null` を設定します。
- **`cultural_explanation`**: `null` を設定します。

### Case 2: タスク2が [B] または [C] (皮肉・裏の意味あり) の場合
- **`main_translation` (最適解)**: 話者の「真の意図」（隠された意味）を汲み取り、それを「希望レベル」と「希望スタイル」に合わせて英語に翻訳します。
- **`superficial_translation` (表面的)**: テキストの「文字通りの意味」（皮肉や建前を理解しない場合の訳）も、別途英語に翻訳します。

## タスク4: [解説の生成]
### Case 1: タスク2が [A] の場合
- このタスクは不要です。`cultural_explanation` フィールドには `null` を設定してください。
### Case 2: タスク2が [B] または [C] の場合
- **`cultural_explanation`**: なぜその翻訳（タスク3）になったのか、元の日本語が持つ文化的なニュアンス（方言、皮肉、建前）を、学習者向けに簡潔に日本語で解説してください。

## タスク5: [語彙・代替案の生成]
「`main_translation` (最適解)」を補足するための「重要語彙」と「代替案」を生成してください。
- **`vocabulary`**: `main_translation` の中から、特に重要だと考える単語やイディオムを2〜3個選び出し、「短い意味」と「詳細な説明」を生成します。
- **`alternatives`**: `main_translation` 以外に考えられる、異なるニュアンスを持つ自然な代替表現を3つ提案し、それぞれの使用頻度を3段階の星（★★★, ★★☆, ★☆☆）で評価します。

# 出力フォーマット (JSON)
{{
  "main_translation": "ここに最適解の英訳（文字列）",
  "superficial_translation": "皮肉や建前の場合、ここに表面的・文字通りの英訳（文字列）。標準的な発言の場合は null",
  "cultural_explanation": "皮肉や建前の場合、ここに文化的な背景の解説（文字列）。標準的な発言の場合は null",
  "vocabulary": [
    {{
      "term": "語彙1",
      "short_meaning": "短い意味1",
      "explanation": "詳細な説明1"
    }},
    {{
      "term": "語彙2",
      "short_meaning": "短い意味2",
      "explanation": "詳細な説明2"
    }}
  ],
  "alternatives": [
    {{
      "expression": "代替案1",
      "nuance": "ニュアンス1",
      "frequency": "★★★"
    }},
    {{
      "expression": "代替案2",
      "nuance": "ニュアンス2",
      "frequency": "★★☆"
    }},
    {{
      "expression": "代替案3",
      "nuance": "ニュアンス3",
      "frequency": "★☆☆"
    }}
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
        force_sarcasm_check = data.get('force_sarcasm_check', False)
        prompt = _get_jp_to_en_prompt(data['text'], data['level'], data['style'], force_sarcasm_check)
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
    force_sarcasm_check = data.get('force_sarcasm_check', False)
    
    # 画像/PDFからテキストを抽出し、そのテキストに基づいてプロンプトを生成するよう指示
    ocr_prompt_text = "まず、与えられたファイル（画像またはPDF）からテキストをすべて抽出してください。次に、その抽出したテキストを「元のテキスト」として、以下の指示に従ってください。\n\n---\n\n"
    
    if direction == 'jp-to-en':
        text_prompt = _get_jp_to_en_prompt("(ファイルから抽出したテキスト)", data['level'], data['style'], force_sarcasm_check)
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