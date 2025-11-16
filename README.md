# Talkable AI 🗣️

An AI-powered "speaking coach" and translation application designed to help users refine their language skills. Built with a pure Python/Flask + vanilla JavaScript stack, this project goes beyond simple translation by providing detailed feedback on vocabulary, usage frequency, and alternative expressions, acting like a personal language tutor.


---

## ✨ Features

- **🤖 AI-Powered Coaching (JP → EN):** Get your Japanese translated into natural, nuanced English. The AI provides:
    - Detailed explanations of key vocabulary.
    - Alternative expressions sorted by real-world usage frequency.
    - Options to specify proficiency level (Eiken/TOEIC based) and style (Formal/Casual).
- **📚 Learning-Focused Translation (EN → JP):** Translate English to natural Japanese while also getting explanations for important vocabulary.
- **📄 File Translation (OCR):** Translate text directly from **images** and **PDFs**. Just upload a file, and the AI will extract the text and translate it.
- **🎨 Modern & Dynamic UI:**
    - An intuitive `日本語 ⇄ 英語` language switcher.
    - A clean, single-page interface where results appear dynamically.
    - A "Copy to Clipboard" button for easy access to your translations.
    - Press `Enter` to translate without needing to click the button.
    - Smooth skeleton loaders for an improved user experience.

## 🛠️ Tech Stack

- **Backend:** Python 3, Flask
- **Frontend:** HTML, CSS, JavaScript (no frameworks)
- **Core AI:** Google Gemini API (`gemini-2.5-flash`)
- **Dependencies:** Pillow (for image handling)

## 🚀 Getting Started

Follow these steps to run the application on your local machine.

### 1. Prerequisites

- Python 3.x installed
- A Google Gemini API Key

### 2. Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/your-repo-name.git
    cd your-repo-name
    ```

2.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

3.  **Set up your API Key:**
    - Create a file named `.env` in the root of the project directory.
    - Add your Gemini API key to the file like this:
      ```
      GEMINI_API_KEY="YOUR_API_KEY_HERE"
      ```

### 3. Running the Application

1.  **Start the Flask server:**
    ```bash
    python app.py
    ```

2.  **Open the application:**
    - Open your web browser and navigate to `http://127.0.0.1:5000`.

---
*This project was bootstrapped and developed with the help of Gemini CLI.*
