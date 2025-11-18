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

    // ===== イベントリスナー（翻訳実行） - ストリーミング対応 =====
    translateBtn.addEventListener('click', async () => {
        const text = textInput.value.trim();
        const originalText = text || `(${fileMimeType === 'application/pdf' ? 'PDF' : '画像'}からのテキスト)`;

        if (!text && !fileData) {
            alert('翻訳したいテキストを入力するか、ファイルを選択してください。');
            return;
        }

        translateBtn.disabled = true;
        translateBtn.textContent = 'AIが分析中...';
        setupStreamingUI(currentDirection); // ストリーミング用のUIを準備

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

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || `サーバーエラー: ${response.status}`);
            }
            
            if (response.body) {
                await processStream(response, currentDirection, originalText);
            } else {
                throw new Error("レスポンスボディがありません。");
            }

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
    
    // ===== ストリーミングUIの準備 =====
    function setupStreamingUI(direction) {
        loadingContainer.style.display = 'none';
        resultsContent.innerHTML = `
            <div id="cultural-explanation-card-container"></div>
            <div id="main-translation-card-container"></div>
            <div id="superficial-translation-card-container"></div>
            <div id="vocabulary-card-container"></div>
            <div id="alternatives-card-container"></div>
        `;
    }

    // ===== ストリームを処理して逐次レンダリング =====
    async function processStream(response, direction, originalText) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let jsonBuffer = '';

        // レンダリング状態の管理
        let renderedStates = {
            cultural_explanation: false,
            main_translation: false,
            translation: false,
            superficial_translation: false,
            vocabulary: false,
            alternatives: false,
            renderedAlternatives: [],
            renderedVocab: []
        };

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            jsonBuffer += decoder.decode(value, { stream: true });
            parseAndRenderStream(jsonBuffer, direction, originalText, renderedStates);
        }

        // --- ストリーム完了後の最終処理 ---
        // 不完全なJSONの末尾をクリーンアップ
        const finalJsonString = jsonBuffer.replace(/```json|```/g, '').trim();
        try {
            const finalData = JSON.parse(finalJsonString);
            // 最終的なデータで再レンダリングして、取りこぼしや不完全な表示をなくす
            renderResults(finalData, direction, originalText);
        } catch (e) {
            console.error("最終的なJSONの解析に失敗しました:", e);
            // ストリーミング中に部分的にでも表示できていれば、それを維持する
            // 表示が空の場合はエラーを表示
            if (resultsContent.innerText.trim() === '') {
                renderError("AIからの応答を解析できませんでした。形式が正しくない可能性があります。");
            }
        }
    }

    // ===== 部分的なJSONを解析してレンダリング =====
    function parseAndRenderStream(jsonBuffer, direction, originalText, states) {
        // 1. 文化的な解説
        if (!states.cultural_explanation && jsonBuffer.includes('"cultural_explanation"')) {
            const match = jsonBuffer.match(/"cultural_explanation":\s*"((?:[^"\\]|\\.)*)"/);
            if (match && match[1]) {
                const container = document.getElementById('cultural-explanation-card-container');
                container.innerHTML = `<div class="result-card cultural-explanation-card"><h2>文化的背景の解説</h2><p>${match[1]}</p></div>`;
                states.cultural_explanation = true;
            }
        }

        // 2. メイン翻訳 (jp-to-en or en-to-jp)
        const mainTranslationKey = direction === 'jp-to-en' ? 'main_translation' : 'translation';
        if (!states[mainTranslationKey] && jsonBuffer.includes(`"${mainTranslationKey}"`)) {
            const match = jsonBuffer.match(new RegExp(`"${mainTranslationKey}":\\s*"((?:[^"\\\\]|\\\\.)*)"`));
            if (match && match[1]) {
                const container = document.getElementById('main-translation-card-container');
                const title = states.cultural_explanation ? "最適な表現 (真の意図)" : (direction === 'jp-to-en' ? "最適な表現" : "翻訳結果");
                container.innerHTML = `<div class="result-card"><div class="card-header"><h2>${title}</h2><button class="copy-btn">コピー</button></div><p class="main-translation-text">${match[1]}</p><div class="original-text-display"><strong>元のテキスト:</strong> ${originalText}</div></div>`;
                states[mainTranslationKey] = true;
            }
        }

        // 3. 表面的な翻訳
        if (!states.superficial_translation && jsonBuffer.includes('"superficial_translation"')) {
            const match = jsonBuffer.match(/"superficial_translation":\s*"((?:[^"\\]|\\.)*)"/);
            if (match && match[1]) {
                const container = document.getElementById('superficial-translation-card-container');
                container.innerHTML = `<div class="result-card superficial-translation-card"><div class="card-header"><h2>表面的・文字通りの訳</h2></div><p class="main-translation-text">${match[1]}</p></div>`;
                states.superficial_translation = true;
            }
        }

        // 4. 語彙リスト
        if (jsonBuffer.includes('"vocabulary"')) {
            if (!states.vocabulary) {
                const container = document.getElementById('vocabulary-card-container');
                container.innerHTML = `<div class="result-card"><h2>重要語彙・表現</h2><ul class="vocabulary-list" id="vocabulary-list-stream"></ul></div>`;
                states.vocabulary = true;
            }
            const vocabArrayMatch = jsonBuffer.match(/"vocabulary":\s*\[([\s\S]*?)\]/);
            if (vocabArrayMatch && vocabArrayMatch[1]) {
                const objectMatches = vocabArrayMatch[1].match(/{[^}]*}/g);
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
                        } catch (e) { /* まだ不完全なオブジェクトなので無視 */ }
                    });
                }
            }
        }

        // 5. 代替案リスト
        if (jsonBuffer.includes('"alternatives"')) {
            if (!states.alternatives) {
                const container = document.getElementById('alternatives-card-container');
                container.innerHTML = `<div class="result-card"><h2>その他の表現</h2><div id="alternatives-list-stream"></div></div>`;
                states.alternatives = true;
            }
            const alternativesArrayMatch = jsonBuffer.match(/"alternatives":\s*\[([\s\S]*?)\]/);
            if (alternativesArrayMatch && alternativesArrayMatch[1]) {
                const objectMatches = alternativesArrayMatch[1].match(/{[^}]*}/g);
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
                        } catch (e) { /* まだ不完全なオブジェクトなので無視 */ }
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

    // ===== 結果をHTMLに整形して表示する関数（最終レンダリング用） =====
    function renderResults(data, direction, originalText) {
        resultsContent.innerHTML = ''; // 既存の逐次レンダリング内容をクリア
        let html = '';

        if (direction === 'en-to-jp' && data.translation) {
            html += `<div class="result-card"><div class="card-header"><h2>翻訳結果</h2><button class="copy-btn">コピー</button></div><p class="main-translation-text">${data.translation}</p><div class="original-text-display"><strong>元のテキスト:</strong> ${originalText}</div></div>`;
            if (data.vocabulary && data.vocabulary.length > 0) {
                html += createVocabularyHtml(data.vocabulary);
            }
        } else if (direction === 'jp-to-en' && data.main_translation) {
            if (data.cultural_explanation) {
                html += `<div class="result-card cultural-explanation-card"><h2>文化的背景の解説</h2><p>${data.cultural_explanation}</p></div>`;
            }

            const mainTitle = data.cultural_explanation ? "最適な表現 (真の意図)" : "最適な表現";
            html += `<div class="result-card"><div class="card-header"><h2>${mainTitle}</h2><button class="copy-btn">コピー</button></div><p class="main-translation-text">${data.main_translation}</p><div class="original-text-display"><strong>元のテキスト:</strong> ${originalText}</div></div>`;

            if (data.superficial_translation) {
                html += `<div class="result-card superficial-translation-card"><div class="card-header"><h2>表面的・文字通りの訳</h2></div><p class="main-translation-text">${data.superficial_translation}</p></div>`;
            }
            
            if (data.vocabulary && data.vocabulary.length > 0) {
                html += createVocabularyHtml(data.vocabulary);
            }
            if (data.alternatives && data.alternatives.length > 0) {
                data.alternatives.sort((a, b) => b.frequency.length - a.frequency.length);
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
    
    // ===== スケルトンローダー（現在は直接使用されていないが、念のため残す） =====
    function showSkeletonLoader(direction) {
        loadingContainer.style.display = 'block';
        let skeletonHtml = (direction === 'jp-to-en')
            ? `<div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line text"></div></div><div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line text"></div><div class="skeleton-line text short"></div></div><div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line text"></div></div><div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line text"></div></div>`
            : `<div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line text"></div><div class="skeleton-line text short"></div></div><div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line text"></div></div>`;
        loadingContainer.innerHTML = skeletonHtml;
    }
});
