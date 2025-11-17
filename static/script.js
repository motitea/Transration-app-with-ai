// DOMが完全に読み込まれてからスクリプトを実行
document.addEventListener('DOMContentLoaded', () => {

    // ===== 状態管理 =====
    let currentDirection = 'jp-to-en';
    let fileData = null; // ファイルデータ(Base64)を保持
    let fileMimeType = null; // ファイルのMIMEタイプを保持

    // ===== DOM要素の取得 =====
    const inputForm = document.getElementById('input-form');
    const levelSelect = document.getElementById('level-select');
    const styleSelect = document.getElementById('style-select');
    const textInput = document.getElementById('text-input');
    const translateBtn = document.getElementById('translate-btn');
    const textInputLabel = document.getElementById('text-input-label');
    const loadingContainer = document.getElementById('loading');
    const resultsContent = document.getElementById('results-content');
    const swapLangBtn = document.getElementById('swap-lang-btn');
    const langFrom = document.getElementById('lang-from');
    const langTo = document.getElementById('lang-to');
    const fileUploadInput = document.getElementById('file-upload-input');
    const filePreviewContainer = document.getElementById('file-preview-container');
    const imagePreview = document.getElementById('image-preview');
    const pdfPreview = document.getElementById('pdf-preview');
    const pdfFilename = document.getElementById('pdf-filename');
    const removeFileBtn = document.getElementById('remove-file-btn');
    const sarcasmCheckbox = document.getElementById('sarcasm-checkbox');

    // ===== UI更新関数 =====
    function updateUiForDirection(direction) {
        if (direction === 'jp-to-en') {
            inputForm.classList.remove('en-to-jp-mode');
            textInputLabel.textContent = '翻訳・校正したい日本語のテキストを入力してください:';
            textInput.placeholder = '例: 会議を延期すべきだと思います。';
            langFrom.textContent = '日本語';
            langTo.textContent = '英語';
        } else {
            inputForm.classList.add('en-to-jp-mode');
            textInputLabel.textContent = '翻訳・校正したい英語のテキストを入力してください:';
            textInput.placeholder = 'e.g., I think we should postpone the meeting.';
            langFrom.textContent = '英語';
            langTo.textContent = '日本語';
        }
    }

    // ===== 初期表示のセットアップ =====
    updateUiForDirection(currentDirection);

    // ===== イベントリスナー（言語切り替え） =====
    swapLangBtn.addEventListener('click', () => {
        currentDirection = currentDirection === 'jp-to-en' ? 'en-to-jp' : 'jp-to-en';
        updateUiForDirection(currentDirection);
    });

    // ===== イベントリスナー（ファイル選択） =====
    fileUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            fileData = event.target.result; // Base64形式のデータ
            fileMimeType = file.type;

            if (file.type.startsWith('image/')) {
                imagePreview.src = fileData;
                imagePreview.style.display = 'block';
                pdfPreview.style.display = 'none';
            } else if (file.type === 'application/pdf') {
                pdfFilename.textContent = file.name;
                imagePreview.style.display = 'none';
                pdfPreview.style.display = 'flex';
            }
            filePreviewContainer.style.display = 'block';
            textInput.value = '';
            textInput.disabled = true;
        };
        reader.readAsDataURL(file);
    });

    // ===== イベントリスナー（ファイル削除） =====
    removeFileBtn.addEventListener('click', () => {
        fileData = null;
        fileMimeType = null;
        fileUploadInput.value = '';
        filePreviewContainer.style.display = 'none';
        textInput.disabled = false;
    });

    // ===== イベントリスナー（翻訳実行） =====
    translateBtn.addEventListener('click', async () => {
        const text = textInput.value.trim();

        if (!text && !fileData) {
            alert('翻訳したいテキストを入力するか、ファイルを選択してください。');
            return;
        }

        translateBtn.disabled = true;
        translateBtn.textContent = 'AIが分析中...';
        resultsContent.innerHTML = '';
        showSkeletonLoader(currentDirection);

        let endpoint = '/api/translate';
        let payload = {
            level: levelSelect.value,
            style: styleSelect.value,
            direction: currentDirection,
            force_sarcasm_check: sarcasmCheckbox.checked
        };

        if (fileData) {
            endpoint = '/api/ocr_translate';
            payload.file = fileData;
            payload.mime_type = fileMimeType;
        } else {
            payload.text = text;
        }

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `サーバーエラー: ${response.status}`);
            renderResults(data, currentDirection, text || `(${fileMimeType === 'application/pdf' ? 'PDF' : '画像'}からのテキスト)`);
        } catch (error) {
            console.error('Error:', error);
            renderError(error.message);
        } finally {
            loadingContainer.style.display = 'none';
            loadingContainer.innerHTML = '';
            translateBtn.disabled = false;
            translateBtn.textContent = '翻訳を実行';
        }
    });

    // ===== テキストエリアでのEnterキーイベント =====
    textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            translateBtn.click();
        }
    });

    // ===== イベントリスナー（結果エリアでのクリック、コピー機能） =====
    resultsContent.addEventListener('click', (e) => {
        if (e.target.classList.contains('copy-btn')) {
            const textToCopy = e.target.closest('.result-card').querySelector('.main-translation-text').textContent;
            navigator.clipboard.writeText(textToCopy).then(() => {
                e.target.textContent = 'コピー完了!';
                setTimeout(() => { e.target.textContent = 'コピー'; }, 2000);
            }).catch(err => {
                console.error('コピーに失敗しました', err);
                alert('コピーに失敗しました。');
            });
        }
    });

    // ===== スケルトンローダーを表示する関数 =====
    function showSkeletonLoader(direction) {
        loadingContainer.style.display = 'block';
        let skeletonHtml = (direction === 'jp-to-en')
            ? `<div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line text"></div></div><div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line text"></div><div class="skeleton-line text short"></div></div><div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line text"></div></div><div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line text"></div></div>`
            : `<div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line text"></div><div class="skeleton-line text short"></div></div><div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line text"></div></div>`;
        loadingContainer.innerHTML = skeletonHtml;
    }

    // ===== 結果をHTMLに整形して表示する関数 =====
    function renderResults(data, direction, originalText) {
        resultsContent.innerHTML = '';
        let html = '';

        if (direction === 'en-to-jp' && data.translation) {
            html += `<div class="result-card"><div class="card-header"><h2>翻訳結果</h2><button class="copy-btn">コピー</button></div><p class="main-translation-text">${data.translation}</p><div class="original-text-display"><strong>元のテキスト:</strong> ${originalText}</div></div>`;
            if (data.vocabulary && data.vocabulary.length > 0) {
                html += createVocabularyHtml(data.vocabulary);
            }
        } else if (direction === 'jp-to-en' && data.main_translation) {
            // 文化的な解説があるかチェック
            if (data.cultural_explanation) {
                html += `<div class="result-card cultural-explanation-card"><h2>文化的背景の解説</h2><p>${data.cultural_explanation}</p></div>`;
            }

            // 最適な表現（真の意図）
            const mainTitle = data.cultural_explanation ? "最適な表現 (真の意図)" : "最適な表現";
            html += `<div class="result-card"><div class="card-header"><h2>${mainTitle}</h2><button class="copy-btn">コピー</button></div><p class="main-translation-text">${data.main_translation}</p><div class="original-text-display"><strong>元のテキスト:</strong> ${originalText}</div></div>`;

            // 表面的な翻訳があるかチェック
            if (data.superficial_translation) {
                html += `<div class="result-card superficial-translation-card"><div class="card-header"><h2>表面的・文字通りの訳</h2></div><p class="main-translation-text">${data.superficial_translation}</p></div>`;
            }
            
            // 語彙と代替案
            data.alternatives.sort((a, b) => b.frequency.length - a.frequency.length);
            if (data.vocabulary && data.vocabulary.length > 0) {
                html += createVocabularyHtml(data.vocabulary);
            }
            if (data.alternatives && data.alternatives.length > 0) {
                html += `<div class="result-card"><h2>その他の表現（使用頻度順）</h2>${data.alternatives.map(item => `<div class="alternative-item"><p><strong>${item.expression}</strong></p><div class="nuance-block"><p><em>ニュアンス:</em> ${item.nuance}</p><p class="frequency" title="使用頻度">頻度: ${item.frequency}</p></div></div>`).join('')}</div>`;
            }
        } else {
            renderError(data.error || "AIからの応答を正しく表示できませんでした。");
            return;
        }
        resultsContent.innerHTML = html;
    }

    // ===== 語彙カード生成のヘルパー関数 =====
    function createVocabularyHtml(vocabulary) {
        return `<div class="result-card"><h2>重要語彙・表現</h2><ul class="vocabulary-list">${vocabulary.map(item => `<li><div class="term-line"><strong class="term">${item.term}</strong><span class="short-meaning">${item.short_meaning}</span></div><p class="explanation">${item.explanation}</p></li>`).join('')}</ul></div>`;
    }

    // ===== エラー表示用の関数 =====
    function renderError(errorMessage) {
        resultsContent.innerHTML = `<div class="result-card error-card"><h2>エラーが発生しました</h2><p>${errorMessage}</p></div>`;
    }
});

