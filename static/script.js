// DOMが完全に読み込まれてからスクリプトを実行
document.addEventListener('DOMContentLoaded', () => {

    // ===== 状態管理 =====
    let currentDirection = 'jp-to-en';
    let typingInterval = null; // タイピングエフェクトのインターバルID

    // ===== DOM要素の取得 =====
    const inputForm = document.getElementById('input-form');
    const levelSelect = document.getElementById('level-select');
    const styleSelect = document.getElementById('style-select');
    const textInput = document.getElementById('text-input');
    const translateBtn = document.getElementById('translate-btn');
    const resultsContent = document.getElementById('results-content');
    const swapLangBtn = document.getElementById('swap-lang-btn');
    const sarcasmCheckbox = document.getElementById('sarcasm-checkbox');

    // ===== UI更新関数 =====
    function updateUiForDirection(direction) {
        if (direction === 'jp-to-en') {
            inputForm.classList.remove('en-to-jp-mode');
            document.getElementById('text-input-label').textContent = '翻訳・校正したい日本語のテキストを入力してください:';
            textInput.placeholder = '例: 会議を延期すべきだと思います。';
            document.getElementById('lang-from').textContent = '日本語';
            document.getElementById('lang-to').textContent = '英語';
        } else {
            inputForm.classList.add('en-to-jp-mode');
            document.getElementById('text-input-label').textContent = '翻訳・校正したい英語のテキストを入力してください:';
            textInput.placeholder = 'e.g., I think we should postpone the meeting.';
            document.getElementById('lang-from').textContent = '英語';
            document.getElementById('lang-to').textContent = '日本語';
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
    document.getElementById('file-upload-input').addEventListener('change', (e) => {
        alert("ファイルアップロードによる翻訳は、現在このバージョンではサポートされていません。テキスト入力を使用してください。");
        e.target.value = '';
        return;
    });

    // ===== イベントリスナー（翻訳実行） - 2段階API・タイピングエフェクト対応 =====
    translateBtn.addEventListener('click', async () => {
        const text = textInput.value.trim();
        if (!text) {
            alert('翻訳したいテキストを入力してください。');
            return;
        }

        if (typingInterval) clearInterval(typingInterval);
        translateBtn.disabled = true;
        translateBtn.textContent = 'AIが翻訳中...';
        setupStreamingUI(currentDirection);

        try {
            const response = await fetch('/api/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text,
                    level: levelSelect.value,
                    style: styleSelect.value,
                    direction: currentDirection
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `サーバーエラー: ${response.status}` }));
                throw new Error(errorData.error);
            }
            
            if (response.body) {
                await processTranslationStream(response, text);
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
        const mainTranslationTitle = direction === 'jp-to-en' ? "翻訳結果" : "翻訳結果";

        resultsContent.innerHTML = `
            <div id="main-translation-card-container">
                <div class="result-card">
                    <div class="card-header">
                        <h2 id="main-translation-title">${mainTranslationTitle}</h2>
                        <button class="copy-btn">コピー</button>
                    </div>
                    <p class="main-translation-text"></p><span class="typing-caret"></span>
                    <div class="original-text-display"></div>
                </div>
            </div>
            <div id="analysis-container" style="display: none;">
                <div id="cultural-explanation-card-container"></div>
                <div id="superficial-translation-card-container"></div>
                <div class="result-card">
                    <h2 id="analysis-title">詳細分析</h2>
                    <div id="vocabulary-card-container"></div>
                    <div id="alternatives-card-container"></div>
                    <div class="spinner-container" style="text-align: center; padding: 20px;"><div class="spinner"></div></div>
                </div>
            </div>
        `;
    }

    // ===== ストリーム1: 翻訳を処理してタイピング表示 =====
    async function processTranslationStream(response, originalText) {
        const mainTranslationElem = document.querySelector('#main-translation-card-container .main-translation-text');
        const caret = document.querySelector('#main-translation-card-container .typing-caret');
        
        const charQueue = [];
        let processedTextLength = 0;
        let jsonBuffer = '';
        let streamEnded = false;

        const originalTextDisplay = document.querySelector('#main-translation-card-container .original-text-display');
        if(originalTextDisplay) {
            originalTextDisplay.innerHTML = `<strong>元のテキスト:</strong> ${originalText}`;
        }

        typingInterval = setInterval(() => {
            if (charQueue.length > 0) {
                mainTranslationElem.textContent += charQueue.shift();
            } else if (streamEnded) {
                clearInterval(typingInterval);
                typingInterval = null;
                if(caret) caret.style.display = 'none';
            }
        }, 20); // 20msごとに1文字表示で高速化

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                streamEnded = true;
                break;
            }
            
            jsonBuffer += decoder.decode(value, { stream: true });

            const currentText = extractValue("translation", jsonBuffer, false);

            if (currentText !== null && currentText.length > processedTextLength) {
                const newChars = currentText.substring(processedTextLength).split('');
                charQueue.push(...newChars);
                processedTextLength = currentText.length;
            }
        }

        const finalJsonString = jsonBuffer.replace(/```json|```/g, '').trim();
        try {
            const finalData = JSON.parse(finalJsonString);
            const translatedText = finalData.translation;
            if (translatedText) {
                // 最終的な翻訳結果を確定
                mainTranslationElem.textContent = translatedText;
                // 分析APIの呼び出し
                document.getElementById('analysis-container').style.display = 'block';
                fetchAndProcessAnalysis(originalText, translatedText);
            }
        } catch (e) {
            console.error("翻訳ストリームの最終解析に失敗:", e);
            renderError("AIからの翻訳応答を解析できませんでした。");
            streamEnded = true;
        }
    }
    
    // ===== ストリーム2: 分析結果をフェッチして処理 =====
    async function fetchAndProcessAnalysis(originalText, translatedText) {
        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    original_text: originalText, 
                    translated_text: translatedText, 
                    direction: currentDirection,
                    level: levelSelect.value,
                    style: styleSelect.value,
                    force_sarcasm_check: sarcasmCheckbox.checked
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `分析サーバーエラー: ${response.status}` }));
                throw new Error(errorData.error);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let jsonBuffer = '';
            let renderedStates = { cultural_explanation: false, superficial_translation: false, vocabulary: false, alternatives: false, renderedAlternatives: [], renderedVocab: [] };

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
                document.getElementById('analysis-title').textContent = "詳細分析（エラー）";
            }
        }
    }

    // ===== パーサー2: 分析ストリームを解析してレンダリング =====
    function parseAndRenderAnalysisStream(jsonBuffer, states) {
        // cultural_explanation
        if (!states.cultural_explanation) {
            const text = extractValue("cultural_explanation", jsonBuffer, true);
            if (text) {
                document.getElementById('cultural-explanation-card-container').innerHTML = `<div class="result-card cultural-explanation-card"><h2>文化的背景の解説</h2><p>${text}</p></div>`;
                const titleElem = document.getElementById('main-translation-title');
                if(titleElem) titleElem.textContent = "最適な表現 (真の意図)";
                states.cultural_explanation = true;
            }
        }

        // superficial_translation
        if (!states.superficial_translation) {
            const text = extractValue("superficial_translation", jsonBuffer, true);
            if (text) {
                document.getElementById('superficial-translation-card-container').innerHTML = `<div class="result-card superficial-translation-card"><div class="card-header"><h2>表面的・文字通りの訳</h2></div><p class="main-translation-text">${text}</p></div>`;
                states.superficial_translation = true;
            }
        }

        // vocabulary
        if (jsonBuffer.includes("vocabulary")) {
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
                        } catch (e) { /* Ignore incomplete objects */ }
                    });
                }
            }
        }

        // alternatives
        if (jsonBuffer.includes("alternatives")) {
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
                        } catch (e) { /* Ignore incomplete objects */ }
                    });
                }
            }
        }
    }

    /**
     * ストリーミングされるJSONバッファから、指定されたキーに対応する文字列値を抽出する。
     * @param {string} key - 検索するJSONキー。
     * @param {string} buffer - 現在のJSONバッファ。
     * @param {boolean} isFinal - バッファが最終形かどうか。trueの場合、終端の引用符が見つからないとnullを返す。
     * @returns {string|null} - 抽出された文字列値、または見つからない場合はnull。
     */
    function extractValue(key, buffer, isFinal = false) {
        const keyPattern = `"${key}": "`;
        const startIndex = buffer.indexOf(keyPattern);
        if (startIndex === -1) {
            return null;
        }

        const valueStartIndex = startIndex + keyPattern.length;
        let currentIndex = valueStartIndex;
        
        while (true) {
            const nextQuoteIndex = buffer.indexOf('"', currentIndex);
            if (nextQuoteIndex === -1) {
                return isFinal ? null : buffer.substring(valueStartIndex);
            }
            if (buffer.charAt(nextQuoteIndex - 1) !== '\\') {
                return buffer.substring(valueStartIndex, nextQuoteIndex);
            }
            currentIndex = nextQuoteIndex + 1;
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
        if (typingInterval) clearInterval(typingInterval);
        resultsContent.innerHTML = `<div class="result-card error-card"><h2>エラーが発生しました</h2><p>${errorMessage}</p></div>`;
    }
});