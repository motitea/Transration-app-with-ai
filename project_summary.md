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

## 4. Key Features Implemented & Enhancements
- **Bidirectional Translation:** Supports both Japanese to English (`jp-to-en`) and English to Japanese (`en-to-jp`) translations.
- **Coaching Mode (JP → EN):** Provides a main translation, key vocabulary explanations, and alternative expressions sorted by usage frequency.
- **Translation & Learning Mode (EN → JP):** Provides a main translation and key vocabulary explanations for Japanese learners.
- **Dynamic UI:**
    - A modern language switcher (`日本語 ⇄ 英語`).
    - Dropdowns for "Expression Level" and "Style" (Formal/Casual) for `jp-to-en` coaching.
    - Results are displayed dynamically on the same page without a reload.
- **Streaming UI for Real-time Results:** Results are streamed from the server and rendered progressively on the page. Users see the main translation, vocabulary, and alternative expressions appear one by one as they are generated, significantly improving perceived performance.
    - A "Copy to Clipboard" button for the main translation.
    - Enter-to-submit functionality in the text area.

### Performance & User Experience Enhancements
- **Two-Stage API Architecture:**
    - **Fast Translation (`POST /api/translate`):** Optimized for speed, this endpoint now provides only the raw translated text. It's designed for the fastest possible "time-to-first-character" display.
    - **Detailed Analysis (`POST /api/analyze`):** This endpoint performs the more time-consuming tasks like vocabulary extraction, alternative expressions, and cultural explanations. It runs in the background after the initial translation is displayed.
- **Hyper-Optimized Streaming:** The frontend (`script.js`) has been refactored to directly handle raw text streams from the fast translation API, eliminating JSON parsing overhead for the initial display. This ensures the quickest possible rendering of the first characters.
- **On-Demand Inner Meaning Analysis:**
    - Replaced the automatic sarcasm detection checkbox with a manual "内的意味を理解する" (Understand Inner Meaning) button.
    - Clicking this button triggers a re-analysis via the `/api/analyze` endpoint with an aggressive sarcasm/subtext detection flag.
    - The analysis API is now more proactive in generating `cultural_explanation` and `superficial_translation` when this feature is activated.
- **Dynamic Main Translation Update:** If the detailed analysis (especially for inner meaning) provides a more nuanced `main_translation`, the displayed translation is dynamically updated to reflect the AI's deeper understanding.

### Bug Fixes
- **Resolved `Invalid regular expression` error:** A persistent client-side error was definitively fixed by replacing all regex-based stream parsing with a safer string manipulation method (`extractValue` function).
- **Fixed Duplicate Translation Display:** Addressed an issue where the main translation text might appear duplicated or flicker due to redundant rendering logic.
- **Corrected Sarcasm Detection Flow:** Ensured that sarcasm and inner meaning analysis correctly updates the main translation and displays relevant cultural explanations and superficial translations.

## 5. API Endpoints
- `POST /api/translate`: Handles text-based translation requests. Optimized for speed, it returns raw translated text.
- `POST /api/analyze`: Performs detailed analysis (vocabulary, alternatives, cultural context, inner meaning) based on the original and translated text.
- `POST /api/ocr_translate`: (Currently disabled to simplify refactoring) Handles file-based (Image/PDF) translation requests.

## 6. How to Run the Application
1.  **Set API Key:** Ensure your `GEMINI_API_KEY` is set in a `.env` file in the root directory.
2.  **Install Dependencies:** Run `pip install -r requirements.txt` in the terminal.
3.  **Start Server:** Run `python app.py` in the terminal.
4.  **Access:** Open a web browser and go to `http://127.0.0.1:5000`.