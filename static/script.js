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

    // ===== イベントリスナー（翻訳実行） - タイピングエフェクト対応 =====
    translateBtn.addEventListener('click', async () => {
        const text = textInput.value.trim();
        if (!text) {
            alert('翻訳したいテキストを入力してください。');
            return;
        }

        if (typingInterval) clearInterval(typingInterval);
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
        const analysisTitle = direction === 'jp-to-en' ? '重要語彙・その他の表現' : '重要語彙・表現';
        const mainTranslationTitle = direction === 'jp-to-en' ? "最適な表現" : "翻訳結果";

        resultsContent.innerHTML = `
            <div id="cultural-explanation-card-container"></div>
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
            <div id="superficial-translation-card-container"></div>
            <div id="analysis-container" class="result-card" style="display: none;">
                <h2>${analysisTitle}</h2>
                <div id="vocabulary-card-container"></div>
                <div id="alternatives-card-container"></div>
                <div class="spinner-container" style="text-align: center; padding: 20px;"><div class="spinner"></div></div>
            </div>
        `;
    }

    // ===== ストリーム1: 翻訳を処理してタイピング表示 =====
    async function processTranslationStream(response, direction, originalText) {
        const mainTranslationElem = document.querySelector('#main-translation-card-container .main-translation-text');
        const caret = document.querySelector('#main-translation-card-container .typing-caret');
        
        const charQueue = [];
        let processedTextLength = 0;
        let jsonBuffer = '';
        let streamEnded = false;

        // 元のテキストを先に表示
        const originalTextDisplay = document.querySelector('#main-translation-card-container .original-text-display');
        if(originalTextDisplay) {
            originalTextDisplay.innerHTML = `<strong>元のテキスト:</strong> ${originalText}`;
        }

        // レンダリングループを開始
        typingInterval = setInterval(() => {
            if (charQueue.length > 0) {
                mainTranslationElem.textContent += charQueue.shift();
            } else if (streamEnded) {
                clearInterval(typingInterval);
                typingInterval = null;
                if(caret) caret.style.display = 'none'; // 終了したらキャレットを消す
            }
        }, 30); // 30msごとに1文字表示

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');

        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                streamEnded = true;
                break;
            }
            
            jsonBuffer += decoder.decode(value, { stream: true });

            // 新しい文字をキューに追加
            const mainKey = direction === 'jp-to-en' ? 'main_translation' : 'translation';
            // Corrected Regex using new RegExp()
            const partialMatchRegex = new RegExp(`"${mainKey}":\s*"((?:[^"\\]|\\.)*)"`);
            const partialMatch = jsonBuffer.match(partialMatchRegex);

            if (partialMatch && partialMatch[1]) {
                const currentText = partialMatch[1];
                if (currentText.length > processedTextLength) {
                    const newChars = currentText.substring(processedTextLength).split('');
                    charQueue.push(...newChars);
                    processedTextLength = currentText.length;
                }
            }
            
            // 他のカードはこれまで通り一括で表示
            parseAndRenderOtherCards(jsonBuffer);
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
            streamEnded = true; // エラー時もループを止める
        }
    }

    // ===== 翻訳以外のカードを一括表示するパーサー =====
    function parseAndRenderOtherCards(jsonBuffer) {
        const culturalContainer = document.getElementById('cultural-explanation-card-container');
        if (!culturalContainer.innerHTML && jsonBuffer.includes('"cultural_explanation"')) {
            // Corrected Regex Literal
            const match = jsonBuffer.match(/"cultural_explanation":\s*"((?:[^"\\]|\\.)*)"/);
            if (match && match[1]) {
                culturalContainer.innerHTML = `<div class="result-card cultural-explanation-card"><h2>文化的背景の解説</h2><p>${match[1]}</p></div>`;
                const titleElem = document.getElementById('main-translation-title');
                if(titleElem) titleElem.textContent = "最適な表現 (真の意図)";
            }
        }

        const superficialContainer = document.getElementById('superficial-translation-card-container');
        if (!superficialContainer.innerHTML && jsonBuffer.includes('"superficial_translation"')) {
            // Corrected Regex Literal
            const match = jsonBuffer.match(/"superficial_translation":\s*"((?:[^"\\]|\\.)*)"/);
            if (match && match[1]) {
                superficialContainer.innerHTML = `<div class="result-card superficial-translation-card"><div class="card-header"><h2>表面的・文字通りの訳</h2></div><p class="main-translation-text">${match[1]}</p></div>`;
            }
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
        if (typingInterval) clearInterval(typingInterval);
        resultsContent.innerHTML = `<div class="result-card error-card"><h2>エラーが発生しました</h2><p>${errorMessage}</p></div>`;
    }
});