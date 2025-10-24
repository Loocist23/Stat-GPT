
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const analyserBtn = document.getElementById('analyser-btn');
const resultsDiv = document.getElementById('results');
const notification = document.getElementById('notification');
const fileInfo = document.getElementById('file-info');

function createAssetSummary() {
    return {
        total: 0,
        images: 0,
        audio: 0,
        other: 0,
        byExtension: {},
    };
}

function createEmptyMetadata() {
    return {
        userProfile: null,
        sharedConversations: [],
        messageFeedback: [],
        shopping: null,
        audioAssets: [],
        libraryAssets: null,
        looseAssets: createAssetSummary(),
        dalleAssets: 0,
    };
}

let jsonData = [];
let invalidItems = 0;
let exportMetadata = createEmptyMetadata();

resultsDiv.innerHTML = '<div class="empty-state">Importez un fichier pour générer les statistiques.</div>';

function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showNotification(message, type = 'info') {
    notification.textContent = message;
    notification.className = `notification ${type !== 'info' ? type : ''}`.trim();
    notification.classList.add('is-visible');
    const timeout = type === 'error' ? 6000 : 4000;
    setTimeout(() => {
        notification.classList.remove('is-visible');
        notification.className = 'notification';
    }, timeout);
}

function resetState() {
    jsonData = [];
    invalidItems = 0;
    exportMetadata = createEmptyMetadata();
    analyserBtn.disabled = true;
    resultsDiv.innerHTML = '<div class="empty-state">Importez un fichier pour générer les statistiques.</div>';
    fileInfo.hidden = true;
    fileInfo.textContent = '';
}

function extractMessageText(message) {
    if (!message || !message.content) {
        return '';
    }

    const { content } = message;
    if (Array.isArray(content.parts)) {
        return content.parts.join(' ');
    }

    if (typeof content === 'string') {
        return content;
    }

    if (typeof content.text === 'string') {
        return content.text;
    }

    return '';
}

const conversationIdRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const imageExtensions = new Set([
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'svg',
    'bmp',
    'heic',
    'heif',
    'jfif',
]);

const audioExtensions = new Set([
    'mp3',
    'wav',
    'm4a',
    'ogg',
    'webm',
    'aac',
    'flac',
]);

function getExtension(name) {
    if (!name || typeof name !== 'string') {
        return 'inconnu';
    }

    const match = name.match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : 'inconnu';
}

function incrementAssetCounters(summary, extension) {
    const ext = extension || 'inconnu';
    summary.total += 1;
    summary.byExtension[ext] = (summary.byExtension[ext] || 0) + 1;

    if (imageExtensions.has(ext)) {
        summary.images += 1;
    } else if (audioExtensions.has(ext)) {
        summary.audio += 1;
    } else {
        summary.other += 1;
    }
}

function renderExtensionList(byExtension) {
    const entries = Object.entries(byExtension)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8);

    if (!entries.length) {
        return '';
    }

    return `
                <ul>
                    ${entries
            .map(
                ([ext, count]) =>
                    `<li><strong>${escapeHTML(ext.toUpperCase())}</strong> : ${count}</li>`,
            )
            .join('')}
                </ul>
            `;
}

function validateConversation(item) {
    return (
        item &&
        typeof item === 'object' &&
        typeof item.conversation_id === 'string' &&
        item.conversation_id.trim().length > 0 &&
        typeof item.title === 'string' &&
        item.title.trim().length > 0 &&
        item.mapping &&
        typeof item.mapping === 'object'
    );
}

function getConversationMetrics(conversation) {
    const mappingEntries = Object.values(conversation.mapping || {});
    let userPrompts = 0;
    let totalCharacters = conversation.title.length;

    for (const node of mappingEntries) {
        const authorRole = node?.message?.author?.role;
        if (authorRole === 'user') {
            userPrompts += 1;
        }

        totalCharacters += extractMessageText(node?.message).length;
    }

    return {
        title: conversation.title,
        conversationId: conversation.conversation_id,
        userPrompts,
        totalCharacters,
    };
}

function buildStats(data) {
    const metrics = data.map(getConversationMetrics);
    const sortedByPrompts = [...metrics].sort((a, b) => b.userPrompts - a.userPrompts);
    const sortedByPromptsAsc = [...metrics].sort((a, b) => a.userPrompts - b.userPrompts);

    const totalConversations = metrics.length;
    const totalPrompts = metrics.reduce((sum, item) => sum + item.userPrompts, 0);
    const totalCharacters = metrics.reduce((sum, item) => sum + item.totalCharacters, 0);

    return {
        metrics,
        totalConversations,
        totalPrompts,
        averagePrompts: totalConversations ? totalPrompts / totalConversations : 0,
        totalCharacters,
        averageCharacters: totalConversations ? totalCharacters / totalConversations : 0,
        maxConversation: sortedByPrompts[0],
        secondMaxConversation: sortedByPrompts[1],
        minConversation: sortedByPromptsAsc[0],
        secondMinConversation: sortedByPromptsAsc[1],
    };
}

function renderFileInfo(file, validCount) {
    const sizeInKB = file.size ? (file.size / 1024).toFixed(1) : '0';
    const archiveInfo = file.originalZipName
        ? `<strong>Archive :</strong> ${escapeHTML(file.originalZipName)}<br/>`
        : '';
    const extras = [];

    if (exportMetadata.userProfile) {
        extras.push('Profil utilisateur');
    }

    if (exportMetadata.sharedConversations.length) {
        extras.push(`${exportMetadata.sharedConversations.length} conv. partagées`);
    }

    if (exportMetadata.messageFeedback.length) {
        extras.push(`${exportMetadata.messageFeedback.length} feedbacks`);
    }

    if (exportMetadata.audioAssets.length) {
        extras.push(`${exportMetadata.audioAssets.length} conv. avec audio`);
    }

    if (exportMetadata.looseAssets.total) {
        extras.push(`${exportMetadata.looseAssets.total} fichiers file-*`);
    }

    if (exportMetadata.dalleAssets) {
        extras.push(`${exportMetadata.dalleAssets} créations DALL·E`);
    }

    if (exportMetadata.libraryAssets) {
        extras.push('Bibliothèque utilisateur');
    }

    if (exportMetadata.shopping) {
        extras.push('Shopping.json');
    }

    const extrasMarkup = extras.length
        ? `<strong>Ressources additionnelles :</strong> ${escapeHTML(extras.join(' · '))}<br/>`
        : '';

    fileInfo.innerHTML = `
  ${archiveInfo}
  <strong>Fichier analysé :</strong> ${escapeHTML(file.name)}<br/>
  <strong>Taille :</strong> ${formatSize(file.size)}<br/>
  <strong>Conversations valides :</strong> ${validCount}${invalidItems ? ` · <strong>Conversations ignorées :</strong> ${invalidItems}` : ''
        }
  ${extrasMarkup}
`;
    fileInfo.hidden = false;
}

function buildLink(conversation) {
    if (!conversation?.conversationId) {
        return '';
    }

    try {
        const url = new URL(conversation.conversationId);
        return `<a href="${escapeHTML(url.toString())}" target="_blank" rel="noopener noreferrer">Ouvrir la conversation</a>`;
    } catch (error) {
        const fallback = `https://chat.openai.com/c/${encodeURIComponent(conversation.conversationId)}`;
        return `<a href="${fallback}" target="_blank" rel="noopener noreferrer">Ouvrir la conversation</a>`;
    }
}

function renderBarChart(metrics) {
    if (!metrics.length) {
        return '<div class="empty-state">Aucune donnée à visualiser pour le moment.</div>';
    }

    const sorted = [...metrics]
        .sort((a, b) => b.userPrompts - a.userPrompts)
        .slice(0, 5);
    const maxPrompts = sorted[0]?.userPrompts || 1;

    return sorted
        .map((item) => {
            const ratio = maxPrompts ? (item.userPrompts / maxPrompts) * 100 : 0;
            const widthPercent = Math.max(4, ratio);
            return `
                        <div class="bar-item">
                            <div class="bar-label">
                                <span>${escapeHTML(item.title)}</span>
                                <span>${item.userPrompts} prompts</span>
                            </div>
                            <div class="bar" style="width: ${widthPercent}%"></div>
                        </div>
                    `;
        })
        .join('');
}

function formatSize(bytes) {
    if (bytes == null || isNaN(bytes)) return '—';
    const units = ['octets', 'Ko', 'Mo', 'Go', 'To', 'Po'];
    let i = 0;
    let value = bytes;

    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i++;
    }

    const formatter = new Intl.NumberFormat('fr-FR', {
        maximumFractionDigits: (i > 0 ? (value < 10 ? 2 : value < 100 ? 1 : 0) : 0)
    });

    return `${formatter.format(value)} ${units[i]}`;
}

async function readOptionalJson(zip, name) {
    const entry = zip.file(name);
    if (!entry) {
        return null;
    }

    try {
        const content = await entry.async('string');
        return JSON.parse(content);
    } catch (error) {
        console.warn(`Impossible de parser ${name}`, error);
        return null;
    }
}

async function collectZipMetadata(zip) {
    const metadata = createEmptyMetadata();
    const looseAssets = metadata.looseAssets;
    const librarySummary = createAssetSummary();
    let libraryFolderName = null;

    const userProfile = await readOptionalJson(zip, 'user.json');
    if (userProfile && typeof userProfile === 'object') {
        metadata.userProfile = userProfile;
    }

    const sharedConversations = await readOptionalJson(zip, 'shared_conversations.json');
    if (Array.isArray(sharedConversations)) {
        metadata.sharedConversations = sharedConversations;
    }

    const messageFeedback = await readOptionalJson(zip, 'message_feedback.json');
    if (Array.isArray(messageFeedback)) {
        metadata.messageFeedback = messageFeedback;
    }

    const shoppingData = await readOptionalJson(zip, 'shopping.json');
    if (shoppingData) {
        metadata.shopping = shoppingData;
    }

    const audioByConversation = new Map();
    let dalleCount = 0;

    Object.values(zip.files).forEach((entry) => {
        if (entry.dir) {
            return;
        }

        const segments = entry.name.split('/');
        if (segments.length >= 2 && conversationIdRegex.test(segments[0]) && segments[1] === 'audio') {
            const conversationId = segments[0];
            const info = audioByConversation.get(conversationId) || { count: 0 };
            info.count += 1;
            audioByConversation.set(conversationId, info);
            return;
        }

        if (segments[0].startsWith('user-')) {
            libraryFolderName = libraryFolderName || segments[0];
            incrementAssetCounters(librarySummary, getExtension(entry.name));
            return;
        }

        if (segments[0] === 'dalle-generations') {
            dalleCount += 1;
            return;
        }

        const baseName = segments[segments.length - 1];
        if (baseName.startsWith('file-') || baseName.startsWith('file_')) {
            incrementAssetCounters(looseAssets, getExtension(baseName));
        }
    });

    metadata.audioAssets = Array.from(audioByConversation.entries())
        .map(([conversationId, info]) => ({
            conversationId,
            count: info.count,
        }))
        .sort((a, b) => b.count - a.count);

    if (libraryFolderName && librarySummary.total) {
        metadata.libraryAssets = {
            folderName: libraryFolderName,
            summary: librarySummary,
        };
    }

    metadata.dalleAssets = dalleCount;

    return metadata;
}

function renderUserProfileSection(profile) {
    const rows = [];

    if (profile.id) {
        rows.push(`<li><strong>ID :</strong> ${escapeHTML(profile.id)}</li>`);
    }

    if (profile.email) {
        rows.push(`<li><strong>Email :</strong> ${escapeHTML(profile.email)}</li>`);
    }

    if (typeof profile.chatgpt_plus_user === 'boolean') {
        rows.push(
            `<li><strong>Abonnement Plus :</strong> ${profile.chatgpt_plus_user ? 'Oui' : 'Non'}</li>`,
        );
    }

    if (profile.birth_year) {
        rows.push(`<li><strong>Année de naissance :</strong> ${escapeHTML(profile.birth_year)}</li>`);
    }

    if (profile.phone_number) {
        rows.push(`<li><strong>Téléphone :</strong> ${escapeHTML(profile.phone_number)}</li>`);
    }

    return `
                <section>
                    <h2>Profil utilisateur</h2>
                    <ul>
                        ${rows.length ? rows.join('') : '<li>Aucune information disponible.</li>'}
                    </ul>
                </section>
            `;
}

function renderSharedConversationsSection(sharedConversations) {
    if (!sharedConversations.length) {
        return '';
    }

    const limited = sharedConversations.slice(0, 8);
    const items = limited
        .map((item) => {
            const status = item.is_anonymous ? 'Anonyme' : 'Identifiée';
            const conversationId = item.conversation_id || item.id || '—';
            return `
                        <li>
                            <strong>${escapeHTML(item.title || 'Sans titre')}</strong>
                            <div>ID conversation : ${escapeHTML(conversationId)}</div>
                            <div>Statut : ${status}</div>
                        </li>
                    `;
        })
        .join('');

    const remaining = sharedConversations.length - limited.length;
    const more = remaining > 0 ? `<p>${remaining} conversation(s) partagée(s) supplémentaire(s).</p>` : '';

    return `
                <section>
                    <h2>Conversations partagées</h2>
                    <ul>${items}</ul>
                    ${more}
                </section>
            `;
}

function renderMessageFeedbackSection(messageFeedback) {
    if (!messageFeedback.length) {
        return '';
    }

    const summary = messageFeedback.reduce((acc, item) => {
        const rating = item?.rating || 'non renseigné';
        acc[rating] = (acc[rating] || 0) + 1;
        return acc;
    }, {});

    const entries = Object.entries(summary)
        .sort(([, a], [, b]) => b - a)
        .map(([rating, count]) => `<li><strong>${escapeHTML(rating)}</strong> : ${count}</li>`)
        .join('');

    return `
                <section>
                    <h2>Feedback sur les réponses</h2>
                    <p>${messageFeedback.length} retour${messageFeedback.length > 1 ? 's' : ''} enregistré${messageFeedback.length > 1 ? 's' : ''
        }.</p>
                    <ul>${entries}</ul>
                </section>
            `;
}

function renderAudioAssetsSection(audioAssets, metrics) {
    if (!audioAssets.length) {
        return '';
    }

    const titleById = new Map(metrics.map((item) => [item.conversationId, item.title]));
    const limited = audioAssets.slice(0, 8);
    const rows = limited
        .map((item) => {
            const title = titleById.get(item.conversationId) || item.conversationId;
            const plural = item.count > 1 ? 's' : '';
            return `<li><strong>${escapeHTML(title)}</strong> — ${item.count} audio${plural}</li>`;
        })
        .join('');
    const totalAudio = audioAssets.reduce((sum, item) => sum + item.count, 0);
    const remaining = audioAssets.length - limited.length;

    return `
                <section>
                    <h2>Conversations contenant de l'audio</h2>
                    <p>${totalAudio} fichier${totalAudio > 1 ? 's' : ''} audio réparti${totalAudio > 1 ? 's' : ''
        } dans ${audioAssets.length} conversation${audioAssets.length > 1 ? 's' : ''}.</p>
                    <ul>${rows}</ul>
                    ${remaining > 0 ? `<p>${remaining} conversation(s) supplémentaire(s) avec audio.</p>` : ''}
                </section>
            `;
}

function renderLibraryAssetsSection(libraryAssets) {
    if (!libraryAssets) {
        return '';
    }

    const { folderName, summary } = libraryAssets;
    return `
                <section>
                    <h2>Bibliothèque personnelle</h2>
                    <p>Dossier <code>${escapeHTML(folderName)}</code> contenant ${summary.total} fichier${summary.total > 1 ? 's' : ''
        } (${summary.images} image${summary.images > 1 ? 's' : ''}, ${summary.audio} audio${summary.audio > 1 ? 's' : ''
        }, ${summary.other} autre${summary.other > 1 ? 's' : ''}).</p>
                    ${renderExtensionList(summary.byExtension)}
                </section>
            `;
}

function renderLooseAssetsSection(looseAssets) {
    if (!looseAssets || !looseAssets.total) {
        return '';
    }

    return `
                <section>
                    <h2>Fichiers file-* et file_*</h2>
                    <p>${looseAssets.total} fichier${looseAssets.total > 1 ? 's' : ''} détecté${looseAssets.total > 1 ? 's' : ''
        } : ${looseAssets.images} image${looseAssets.images > 1 ? 's' : ''}, ${looseAssets.audio} audio${looseAssets.audio > 1 ? 's' : ''
        } et ${looseAssets.other} autre${looseAssets.other > 1 ? 's' : ''}.</p>
                    ${renderExtensionList(looseAssets.byExtension)}
                </section>
            `;
}

function renderDalleSection(dalleCount) {
    if (!dalleCount) {
        return '';
    }

    return `
                <section>
                    <h2>Générations DALL·E</h2>
                    <p>${dalleCount} ressource${dalleCount > 1 ? 's' : ''} trouvée${dalleCount > 1 ? 's' : ''} dans <code>dalle-generations</code>.</p>
                </section>
            `;
}

function renderShoppingSection(shopping) {
    if (!shopping) {
        return '';
    }

    let preview = '';
    try {
        preview = JSON.stringify(shopping, null, 2) || '';
    } catch (error) {
        preview = 'Impossible de générer un aperçu lisible.';
    }

    const isArray = Array.isArray(shopping);
    const size = isArray ? shopping.length : Object.keys(shopping).length;
    const kind = isArray ? 'élément' : 'clé';
    const snippet = escapeHTML(preview.slice(0, 800));
    const truncated = preview.length > 800 ? '…' : '';

    if (!size) {
        return '';
    }

    return `
                <section>
                    <h2>Données shopping</h2>
                    <p>${size} ${kind}${size > 1 ? 's' : ''} détecté${size > 1 ? 's' : ''}.</p>
                    <pre>${snippet}${truncated}</pre>
                </section>
            `;
}

function renderResults(stats) {
    if (!stats.totalConversations) {
        resultsDiv.innerHTML = '<div class="empty-state">Importez un fichier pour générer les statistiques.</div>';
        return;
    }

    const {
        totalConversations,
        totalPrompts,
        averagePrompts,
        totalCharacters,
        averageCharacters,
        maxConversation,
        secondMaxConversation,
        minConversation,
        secondMinConversation,
        metrics,
    } = stats;

    const summarySection = `
                <section>
                    <h2>Résumé global</h2>
                    <div class="stats-grid">
                        <div class="stat-card">
                            <span>Conversations</span>
                            <strong>${totalConversations}</strong>
                        </div>
                        <div class="stat-card">
                            <span>Prompts utilisateurs</span>
                            <strong>${totalPrompts}</strong>
                        </div>
                        <div class="stat-card">
                            <span>Moyenne prompts / conv.</span>
                            <strong>${averagePrompts.toFixed(2)}</strong>
                        </div>
                        <div class="stat-card">
                            <span>Caractères analysés</span>
                            <strong>${totalCharacters.toLocaleString('fr-FR')}</strong>
                        </div>
                        <div class="stat-card">
                            <span>Moyenne caractères / conv.</span>
                            <strong>${Math.round(averageCharacters).toLocaleString('fr-FR')}</strong>
                        </div>
                    </div>
                </section>
            `;

    const highlightsSection = `
                <section>
                    <h2>Conversations remarquables</h2>
                    <div class="card-grid">
                        ${maxConversation
            ? `
                                    <div class="card">
                                        <h3>Conversation la plus active</h3>
                                        <p><strong>${escapeHTML(maxConversation.title)}</strong></p>
                                        <p>${maxConversation.userPrompts} prompts · ${maxConversation.totalCharacters.toLocaleString('fr-FR')} caractères</p>
                                        ${buildLink(maxConversation)}
                                    </div>
                                `
            : ''
        }
                        ${secondMaxConversation
            ? `
                                    <div class="card">
                                        <h3>Deuxième plus active</h3>
                                        <p><strong>${escapeHTML(secondMaxConversation.title)}</strong></p>
                                        <p>${secondMaxConversation.userPrompts} prompts · ${secondMaxConversation.totalCharacters.toLocaleString('fr-FR')} caractères</p>
                                        ${buildLink(secondMaxConversation)}
                                    </div>
                                `
            : ''
        }
                        ${minConversation
            ? `
                                    <div class="card">
                                        <h3>Conversation la plus courte</h3>
                                        <p><strong>${escapeHTML(minConversation.title)}</strong></p>
                                        <p>${minConversation.userPrompts} prompts · ${minConversation.totalCharacters.toLocaleString('fr-FR')} caractères</p>
                                        ${buildLink(minConversation)}
                                    </div>
                                `
            : ''
        }
                        ${secondMinConversation
            ? `
                                    <div class="card">
                                        <h3>Deuxième plus courte</h3>
                                        <p><strong>${escapeHTML(secondMinConversation.title)}</strong></p>
                                        <p>${secondMinConversation.userPrompts} prompts · ${secondMinConversation.totalCharacters.toLocaleString('fr-FR')} caractères</p>
                                        ${buildLink(secondMinConversation)}
                                    </div>
                                `
            : ''
        }
                    </div>
                </section>
            `;

    const barSection = `
                <section>
                    <h2>Top 5 des conversations par nombre de prompts</h2>
                    <div class="bar-chart">
                        ${renderBarChart(metrics)}
                    </div>
                </section>
            `;

    const optionalSections = [
        exportMetadata.userProfile ? renderUserProfileSection(exportMetadata.userProfile) : '',
        exportMetadata.sharedConversations.length
            ? renderSharedConversationsSection(exportMetadata.sharedConversations)
            : '',
        exportMetadata.messageFeedback.length
            ? renderMessageFeedbackSection(exportMetadata.messageFeedback)
            : '',
        exportMetadata.audioAssets.length
            ? renderAudioAssetsSection(exportMetadata.audioAssets, metrics)
            : '',
        exportMetadata.libraryAssets ? renderLibraryAssetsSection(exportMetadata.libraryAssets) : '',
        renderLooseAssetsSection(exportMetadata.looseAssets),
        renderDalleSection(exportMetadata.dalleAssets),
        renderShoppingSection(exportMetadata.shopping),
    ].filter(Boolean);

    resultsDiv.innerHTML = [summarySection, highlightsSection, barSection, ...optionalSections].join('');
}

function handleJsonImport(file, textContent) {
    try {
        const parsed = JSON.parse(textContent);
        if (!Array.isArray(parsed)) {
            throw new Error('Le fichier doit contenir un tableau de conversations.');
        }

        const validConversations = [];
        invalidItems = 0;

        for (const conversation of parsed) {
            if (validateConversation(conversation)) {
                validConversations.push(conversation);
            } else {
                invalidItems += 1;
            }
        }

        if (!validConversations.length) {
            resetState();
            showNotification('Aucune conversation valide détectée dans le fichier.', 'error');
            return;
        }

        jsonData = validConversations;
        analyserBtn.disabled = false;
        showNotification('Données prêtes à être analysées.', 'success');
        renderFileInfo(file, validConversations.length);
    } catch (error) {
        resetState();
        showNotification(`Erreur lors du chargement : ${error.message}`, 'error');
    }
}

async function readFile(file) {
    if (!file) {
        return;
    }

    resetState();

    const lowerName = file.name?.toLowerCase() ?? '';
    const isZipType =
        file.type === 'application/zip' ||
        file.type === 'application/x-zip-compressed' ||
        lowerName.endsWith('.zip');

    if (isZipType) {
        showNotification('Extraction de l\'archive en cours...', 'info');
        try {
            const zip = await JSZip.loadAsync(file);
            exportMetadata = await collectZipMetadata(zip);
            const candidates = Object.values(zip.files)
                .filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith('conversations.json'))
                .sort((a, b) => a.name.length - b.name.length);

            if (!candidates.length) {
                throw new Error("Aucun fichier conversations.json trouvé dans l'archive.");
            }

            const conversationEntry = candidates[0];
            const content = await conversationEntry.async('string');
            const syntheticFile = {
                name: conversationEntry.name,
                size: file.size,
                originalZipName: file.name,
            };

            handleJsonImport(syntheticFile, content);
        } catch (error) {
            resetState();
            showNotification(`Erreur lors de l'analyse de l'archive : ${error.message}`, 'error');
        }

        return;
    }

    const isJsonType = file.type === 'application/json' || file.type === '' || file.type === 'text/plain';
    const hasJsonExtension = lowerName.endsWith('.json');
    if (!isJsonType && !hasJsonExtension) {
        showNotification('Veuillez sélectionner un fichier JSON ou ZIP valide.', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => handleJsonImport(file, event.target.result);
    reader.onerror = () => showNotification('Impossible de lire le fichier sélectionné.', 'error');
    reader.readAsText(file);
}

dropzone.addEventListener('click', () => fileInput.click());

dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('dragover');
    const [file] = event.dataTransfer.files;
    if (file) {
        readFile(file);
    }
});

fileInput.addEventListener('change', (event) => {
    const [file] = event.target.files;
    if (file) {
        readFile(file);
    }
});

analyserBtn.addEventListener('click', () => {
    if (!jsonData.length) {
        showNotification('Veuillez charger un fichier avant d\'analyser.', 'error');
        return;
    }

    const stats = buildStats(jsonData);
    renderResults(stats);
});
