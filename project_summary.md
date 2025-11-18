# Project Summary: Talkable AI

## 1. Project Vision
An AI-powered "speaking coach" and translation application designed to help users refine their language skills. It goes beyond simple translation by providing detailed feedback on vocabulary, usage frequency, and alternative expressions, acting like a personal language tutor.

## 2. Core Technology Stack (Pure Stack)
- **Backend:** Python + Flask
- **Frontend:** HTML, CSS, JavaScript (no frameworks)
- **Core Logic:** Google Gemini API (currently configured for `gemini-2.5-flash`)

## 3. File Structure
```
.
├── app.py                  # Main Flask application, API endpoints
├── requirements.txt        # Python dependencies
├── templates/
│   └── index.html          # Main HTML file
├── static/
│   ├── style.css           # All CSS styles
│   └── script.js           # All frontend JavaScript logic
├── .env                    # (User-managed) For API Key
└── project_summary.md      # This file
```

## 4. Key Features Implemented
- **Bidirectional Translation:** Supports both Japanese to English (`jp-to-en`) and English to Japanese (`en-to-jp`) translations.
- **Coaching Mode (JP → EN):** Provides a main translation, key vocabulary explanations, and alternative expressions sorted by usage frequency.
- **Translation & Learning Mode (EN → JP):** Provides a main translation and key vocabulary explanations for Japanese learners.
- **File-based Translation (OCR):** Users can upload an **Image** or a **PDF** file. The backend extracts text using multimodal AI capabilities and translates it.
- **Dynamic UI:**
    - A modern language switcher (`日本語 ⇄ 英語`).
    - Dropdowns for "Expression Level" and "Style" (Formal/Casual) for `jp-to-en` coaching.
    - Results are displayed dynamically on the same page without a reload.
- **Streaming UI for Real-time Results:** Results are streamed from the server and rendered progressively on the page. Users see the main translation, vocabulary, and alternative expressions appear one by one as they are generated, significantly improving perceived performance.
    - A "Copy to Clipboard" button for the main translation.
    - Enter-to-submit functionality in the text area.

## 5. API Endpoints
- `POST /api/translate`: Handles text-based translation requests. The response is streamed as plain text for real-time UI updates.
- `POST /api/ocr_translate`: Handles file-based (Image/PDF) translation requests. The response is also streamed.

## 6. How to Run the Application
1.  **Set API Key:** Ensure your `GEMINI_API_KEY` is set in a `.env` file in the root directory.
2.  **Install Dependencies:** Run `pip install -r requirements.txt` in the terminal.
3.  **Start Server:** Run `python app.py` in the terminal.
4.  **Access:** Open a web browser and go to `http://127.0.0.1:5000`.
