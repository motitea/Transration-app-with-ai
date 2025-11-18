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
        // OCRは現在無効化されているため、ユーザーに通知
        alert("ファイルアップロードによる翻訳は、現在このバージョンではサポートされていません。テキスト入力を使用してください。");
        fileUploadInput.value = ''; // 選択をリセット
        return;
    });

    // ===== イベントリスナー（ファイル削除） =====
    removeFileBtn.addEventListener('click', () => {
        fileData = null;
        fileMimeType = null;
        fileUploadInput.value = '';
        filePreviewContainer.style.display = 'none';
        textInput.disabled = false;
    });

    // ===== イベントリスナー（翻訳実行） - 2段階API呼び出し =====
    translateBtn.addEventListener('click', async () => {
        const text = textInput.value.trim();
        if (!text) {
            alert('翻訳したいテキストを入力してください。');
            return;
        }

        translateBtn.disabled = true;
        translateBtn.textContent = 'AIが分析中...';
        setupStreamingUI(currentDirection);

        try {
            const response = await fetch('/api/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text,
                    level: levelSelect.value,
                    style: styleSelect.value,
                    direction: currentDirection,
                    force_sarcasm_check: sarcasmCheckbox.checked
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `サーバーエラー: ${response.status}` }));
                throw new Error(errorData.error);
            }
            
            if (response.body) {
                await processTranslationStream(response, currentDirection, text);
            } else {
                throw new Error("レスポンスボディがありません。");
            }

        } catch (error) {
            console.error('Error:', error);
            renderError(error.message);
        } finally {
            translateBtn.disabled = false;
            translateBtn.textContent = '翻訳を実行';
        }
    });
    
    // ===== ストリーミングUIの準備 =====
    function setupStreamingUI(direction) {
        loadingContainer.style.display = 'none';
        const analysisTitle = direction === 'jp-to-en' ? '重要語彙・その他の表現' : '重要語彙・表現';
        resultsContent.innerHTML = `
            <div id="cultural-explanation-card-container"></div>
            <div id="main-translation-card-container"></div>
            <div id="superficial-translation-card-container"></div>
            <div id="analysis-container" class="result-card" style="display: none;">
                <h2>${analysisTitle}</h2>
                <div id="vocabulary-card-container"></div>
                <div id="alternatives-card-container"></div>
                <div class="spinner-container" style="text-align: center; padding: 20px;"><div class="spinner"></div></div>
            </div>
        `;
    }

    // ===== ストリーム1: 翻訳を処理して逐次レンダリング =====
    async function processTranslationStream(response, direction, originalText) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let jsonBuffer = '';
        let renderedStates = { cultural_explanation: false, main_translation: false, translation: false, superficial_translation: false };

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            jsonBuffer += decoder.decode(value, { stream: true });
            parseAndRenderTranslationStream(jsonBuffer, direction, originalText, renderedStates);
        }

        const finalJsonString = jsonBuffer.replace(/```json|```/g, '').trim();
        try {
            const finalData = JSON.parse(finalJsonString);
            const translatedText = finalData.main_translation || finalData.translation;
            if (translatedText) {
                document.getElementById('analysis-container').style.display = 'block';
                fetchAndProcessAnalysis(originalText, translatedText, direction);
            }
        } catch (e) {
            console.error("翻訳ストリームの最終解析に失敗:", e);
            renderError("AIからの翻訳応答を解析できませんでした。");
        }
    }
    
    // ===== ストリーム2: 分析結果をフェッチして処理 =====
    async function fetchAndProcessAnalysis(originalText, translatedText, direction) {
        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ original_text: originalText, translated_text: translatedText, direction: direction }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `分析サーバーエラー: ${response.status}` }));
                throw new Error(errorData.error);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let jsonBuffer = '';
            let renderedStates = { vocabulary: false, alternatives: false, renderedAlternatives: [], renderedVocab: [] };

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                jsonBuffer += decoder.decode(value, { stream: true });
                parseAndRenderAnalysisStream(jsonBuffer, renderedStates);
            }
            
            const spinner = document.querySelector('#analysis-container .spinner-container');
            if(spinner) spinner.style.display = 'none';

        } catch (error) {
            console.error('Analysis Error:', error);
            const analysisContainer = document.getElementById('analysis-container');
            if(analysisContainer) {
                const spinner = analysisContainer.querySelector('.spinner-container');
                if(spinner) spinner.style.display = 'none';
                analysisContainer.innerHTML += `<p class="error-text" style="padding: 0 20px 20px;">分析データの取得中にエラーが発生しました。</p>`;
            }
        }
    }

    // ===== パーサー1: 翻訳ストリームを解析してレンダリング =====
    function parseAndRenderTranslationStream(jsonBuffer, direction, originalText, states) {
        if (!states.cultural_explanation && jsonBuffer.includes('"cultural_explanation"')) {
            const match = jsonBuffer.match(/"cultural_explanation":\s*"((?:[^"\\]|\\.)*)"/);
            if (match && match[1]) {
                document.getElementById('cultural-explanation-card-container').innerHTML = `<div class="result-card cultural-explanation-card"><h2>文化的背景の解説</h2><p>${match[1]}</p></div>`;
                states.cultural_explanation = true;
            }
        }

        const mainKey = direction === 'jp-to-en' ? 'main_translation' : 'translation';
        if (!states[mainKey] && jsonBuffer.includes(`"${mainKey}"`)) {
            const match = jsonBuffer.match(new RegExp(`"${mainKey}":\s*"((?:[^"\\]|\\.)*)"`));
            if (match && match[1]) {
                const title = states.cultural_explanation ? "最適な表現 (真の意図)" : (direction === 'jp-to-en' ? "最適な表現" : "翻訳結果");
                document.getElementById('main-translation-card-container').innerHTML = `<div class="result-card"><div class="card-header"><h2>${title}</h2><button class="copy-btn">コピー</button></div><p class="main-translation-text">${match[1]}</p><div class="original-text-display"><strong>元のテキスト:</strong> ${originalText}</div></div>`;
                states[mainKey] = true;
            }
        }

        if (!states.superficial_translation && jsonBuffer.includes('"superficial_translation"')) {
            const match = jsonBuffer.match(/"superficial_translation":\s*"((?:[^"\\]|\\.)*)"/);
            if (match && match[1]) {
                document.getElementById('superficial-translation-card-container').innerHTML = `<div class="result-card superficial-translation-card"><div class="card-header"><h2>表面的・文字通りの訳</h2></div><p class="main-translation-text">${match[1]}</p></div>`;
                states.superficial_translation = true;
            }
        }
    }

    // ===== パーサー2: 分析ストリームを解析してレンダリング =====
    function parseAndRenderAnalysisStream(jsonBuffer, states) {
        if (jsonBuffer.includes('"vocabulary"')) {
            if (!states.vocabulary) {
                document.getElementById('vocabulary-card-container').innerHTML = `<ul class="vocabulary-list" id="vocabulary-list-stream"></ul>`;
                states.vocabulary = true;
            }
            const match = jsonBuffer.match(/"vocabulary":\s*(\[[\s\S]*?\])/);
            if (match && match[1]) {
                const objectMatches = match[1].match(/{[^}]*}/g);
                if (objectMatches) {
                    objectMatches.forEach(objStr => {
                        try {
                            const item = JSON.parse(objStr);
                            if (item.term && !states.renderedVocab.some(v => v.term === item.term)) {
                                const list = document.getElementById('vocabulary-list-stream');
                                const li = document.createElement('li');
                                li.innerHTML = `<div class="term-line"><strong class="term">${item.term}</strong><span class="short-meaning">${item.short_meaning}</span></div><p class="explanation">${item.explanation}</p>`;
                                list.appendChild(li);
                                states.renderedVocab.push(item);
                            }
                        } catch (e) { /* 不完全なオブジェクトは無視 */ }
                    });
                }
            }
        }

        if (jsonBuffer.includes('"alternatives"')) {
            if (!states.alternatives) {
                document.getElementById('alternatives-card-container').innerHTML = `<div id="alternatives-list-stream"></div>`;
                states.alternatives = true;
            }
            const match = jsonBuffer.match(/"alternatives":\s*(\[[\s\S]*?\])/);
            if (match && match[1]) {
                const objectMatches = match[1].match(/{[^}]*}/g);
                if (objectMatches) {
                    objectMatches.forEach(objStr => {
                        try {
                            const item = JSON.parse(objStr);
                            if (item.expression && !states.renderedAlternatives.some(a => a.expression === item.expression)) {
                                const list = document.getElementById('alternatives-list-stream');
                                const div = document.createElement('div');
                                div.className = 'alternative-item';
                                div.innerHTML = `<p><strong>${item.expression}</strong></p><div class="nuance-block"><p><em>ニュアンス:</em> ${item.nuance}</p><p class="frequency" title="使用頻度">頻度: ${item.frequency}</p></div>`;
                                list.appendChild(div);
                                states.renderedAlternatives.push(item);
                            }
                        } catch (e) { /* 不完全なオブジェクトは無視 */ }
                    });
                }
            }
        }
    }

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

    // ===== エラー表示用の関数 =====
    function renderError(errorMessage) {
        resultsContent.innerHTML = `<div class="result-card error-card"><h2>エラーが発生しました</h2><p>${errorMessage}</p></div>`;
    }
});