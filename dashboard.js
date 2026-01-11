// Global state
let resultsPath = 'results';
let dataCache = {};
let uploadedFiles = {};  // Store uploaded files in memory

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Set default active page
    showPage('overview');
    
    // Try to auto-load from results folder first
    loadResults();
    
    // Update calibration plot when selection changes
    document.getElementById('calibrationModel').addEventListener('change', updateCalibrationPlot);
    document.getElementById('calibrationType').addEventListener('change', updateCalibrationPlot);
});

// Handle folder selection
function handleFolderSelect(event) {
    const files = event.target.files;
    const statusDiv = document.getElementById('loadStatus');
    
    if (files.length === 0) {
        statusDiv.textContent = 'No files selected';
        statusDiv.className = 'error';
        return;
    }
    
    // Store files in memory with multiple path variations for lookup
    uploadedFiles = {};
    for (let file of files) {
        // Create relative path (remove the selected folder name)
        let relativePath = file.webkitRelativePath || file.name;
        
        // Normalize path separators
        relativePath = relativePath.replace(/\\/g, '/');
        
        // Remove the first folder name if it exists (the selected folder)
        const pathParts = relativePath.split('/');
        if (pathParts.length > 1) {
            // Try with and without the first folder
            const withoutFirst = pathParts.slice(1).join('/');
            uploadedFiles[withoutFirst] = file;
        }
        
        // Store with original path
        uploadedFiles[relativePath] = file;
        
        // Also store by just filename for easier lookup
        uploadedFiles[file.name] = file;
        
        // Store with forward and backslash variations
        uploadedFiles[relativePath.replace(/\//g, '\\')] = file;
        uploadedFiles[relativePath.replace(/\\/g, '/')] = file;
    }
    
    statusDiv.textContent = `✓ Loaded ${files.length} files`;
    statusDiv.className = 'success';
    
    // Clear cache to force reload
    dataCache = {};
    
    // Load the overview page
    loadPageData('overview');
}

// Navigation
function showPage(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    // Show selected page
    document.getElementById(pageId).classList.add('active');
    
    // Update nav menu
    document.querySelectorAll('.nav-menu a').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('onclick')?.includes(pageId)) {
            link.classList.add('active');
        }
    });
    
    // Load page-specific data
    loadPageData(pageId);
}

// Load results folder
function loadResults() {
    // Always use 'results' folder - no user input needed
    resultsPath = 'results';
    const statusDiv = document.getElementById('loadStatus');
    
    // Test if results folder exists by trying to load a known file
    fetch(`${resultsPath}/run_config.json`)
        .then(response => {
            if (response.ok) {
                statusDiv.textContent = `✓ Loaded: ${resultsPath}/`;
                statusDiv.className = 'success';
                loadPageData('overview');
            } else {
                // Try alternative paths
                const altPaths = ['masld_export/results', '../results', './masld_export/results'];
                let tried = 0;
                const tryNext = () => {
                    if (tried < altPaths.length) {
                        resultsPath = altPaths[tried];
                        fetch(`${resultsPath}/run_config.json`)
                            .then(res => {
                                if (res.ok) {
                                    statusDiv.textContent = `✓ Loaded: ${resultsPath}/`;
                                    statusDiv.className = 'success';
                                    loadPageData('overview');
                                } else {
                                    tried++;
                                    tryNext();
                                }
                            })
                            .catch(() => {
                                tried++;
                                tryNext();
                            });
                    } else {
                        statusDiv.textContent = `✗ Results folder not found. Please ensure 'results/' folder exists.`;
                        statusDiv.className = 'error';
                    }
                };
                tryNext();
            }
        })
        .catch(error => {
            statusDiv.textContent = `✗ Results folder not found. Please ensure 'results/' folder exists.`;
            statusDiv.className = 'error';
        });
}

// Load data for specific page
function loadPageData(pageId) {
    switch(pageId) {
        case 'overview':
            loadOverview();
            break;
        case 'metrics':
            loadMetrics();
            break;
        case 'calibration':
            loadCalibration();
            break;
        case 'uncertainty':
            loadUncertainty();
            break;
        case 'shap':
            loadShap();
            break;
        case 'reports':
            loadReports();
            break;
        case 'config':
            loadConfig();
            break;
        case 'checker':
            loadFileChecker();
            break;
    }
}

// Overview Page
function loadOverview() {
    // Load metrics CSV
    loadCSV(`${resultsPath}/patient_metrics_summary.csv`).then(df => {
        if (df && df.length > 0) {
            const firstRow = df[0];
            document.getElementById('totalPatients').textContent = firstRow.n_patients || df.length;
            document.getElementById('masldCases').textContent = firstRow.n_pos || 'N/A';
            document.getElementById('healthyCases').textContent = firstRow.n_neg || 'N/A';
        }
    }).catch(() => {
        // CSV not loaded, keep defaults
    });
    
    // Load config for date
    loadJSON(`${resultsPath}/run_config.json`).then(config => {
        if (config && config.timestamp) {
            document.getElementById('runDate').textContent = config.timestamp.substring(0, 10);
        }
    }).catch(() => {
        // Config not loaded, keep default
    });
    
    // Load images - try multiple path formats
    const imagePaths = [
        'roc_curves_patient_level.png',
        'pr_curves_patient_level.png',
        'confusion_matrices_patient_level.png',
        'coverage_curve.png'
    ];
    
    const imageIds = ['rocCurves', 'prCurves', 'confusionMatrices', 'coverageCurve'];
    
    imagePaths.forEach((imgPath, index) => {
        const imgElement = document.getElementById(imageIds[index]);
        if (imgElement) {
            // Try with resultsPath prefix
            loadImageSrc(`${resultsPath}/${imgPath}`, imgElement);
        }
    });
}

// Metrics Page
function loadMetrics() {
    loadCSV(`${resultsPath}/patient_metrics_summary.csv`).then(df => {
        if (df) {
            document.getElementById('metricsTable').innerHTML = createTable(df);
        }
    });
    
    loadCSV(`${resultsPath}/patient_confusion_matrices.csv`).then(df => {
        if (df) {
            document.getElementById('confusionTable').innerHTML = createTable(df);
        }
    });
    
    loadImageSrc(`${resultsPath}/confusion_matrices_patient_level.png`, document.getElementById('confusionImage'));
    
    loadCSV(`${resultsPath}/model_comparison_stats.csv`).then(df => {
        if (df) {
            document.getElementById('modelComparisonTable').innerHTML = createTable(df);
        }
    });
}

// Calibration Page
function updateCalibrationPlot() {
    const model = document.getElementById('calibrationModel').value;
    const type = document.getElementById('calibrationType').value;
    const plotPath = `${resultsPath}/calibration_plots/calibration_plot_patientlevel_${model}_${type}.png`;
    loadImageSrc(plotPath, document.getElementById('calibrationPlot'));
}

function loadCalibration() {
    updateCalibrationPlot();
    loadCSV(`${resultsPath}/calibration_summary.csv`).then(df => {
        if (df) {
            document.getElementById('calibrationSummaryTable').innerHTML = createTable(df);
        }
    });
}

// Uncertainty & Coverage Page
function loadUncertainty() {
    loadCSV(`${resultsPath}/cnn_uncertainty_patientlevel.csv`).then(df => {
        if (df) {
            document.getElementById('uncertaintyTable').innerHTML = createTable(df);
        }
    });
    
    loadCSV(`${resultsPath}/coverage_vs_performance.csv`).then(df => {
        if (df) {
            document.getElementById('coverageTable').innerHTML = createTable(df);
        }
    });
    
    loadImageSrc(`${resultsPath}/coverage_curve.png`, document.getElementById('coverageCurveImg'));
}

// SHAP Page
function loadShap() {
    loadImageSrc(`${resultsPath}/shap_plots/shap_global_summary.png`, document.getElementById('shapGlobal'));
    
    // Find local SHAP files (check uploaded files or use defaults)
    const shapCases = ['01', '02', '03', '04', '05', '06'];
    const select = document.getElementById('shapCaseSelect');
    select.innerHTML = '<option value="">Select Case...</option>';
    
    // If files are uploaded, check which ones exist
    if (Object.keys(uploadedFiles).length > 0) {
        const availableCases = shapCases.filter(caseNum => {
            const path = `shap_plots/shap_local_case_${caseNum}.png`;
            return uploadedFiles[path];
        });
        availableCases.forEach(caseNum => {
            const option = document.createElement('option');
            option.value = caseNum;
            option.textContent = `Case-${caseNum}`;
            select.appendChild(option);
        });
    } else {
        shapCases.forEach(caseNum => {
            const option = document.createElement('option');
            option.value = caseNum;
            option.textContent = `Case-${caseNum}`;
            select.appendChild(option);
        });
    }
}

function loadShapLocal() {
    const caseNum = document.getElementById('shapCaseSelect').value;
    if (caseNum) {
        const plotPath = `${resultsPath}/shap_plots/shap_local_case_${caseNum}.png`;
        loadImageSrc(plotPath, document.getElementById('shapLocal'));
    }
}

// AI Reports Page
function loadReports() {
    loadCSV(`${resultsPath}/ai_reports/index.csv`).then(df => {
        if (df) {
            document.getElementById('reportsIndexTable').innerHTML = createTable(df);
        }
    });
    
    // Find report images
    const reportCases = ['01', '02', '03', '04', '05', '06', '07', '08'];
    const select = document.getElementById('reportCaseSelect');
    select.innerHTML = '<option value="">Select Case Report...</option>';
    
    // If files are uploaded, check which ones exist
    if (Object.keys(uploadedFiles).length > 0) {
        const availableCases = reportCases.filter(caseNum => {
            const path = `ai_reports/Case-${caseNum}.png`;
            return uploadedFiles[path];
        });
        availableCases.forEach(caseNum => {
            const option = document.createElement('option');
            option.value = caseNum;
            option.textContent = `Case-${caseNum}`;
            select.appendChild(option);
        });
    } else {
        reportCases.forEach(caseNum => {
            const option = document.createElement('option');
            option.value = caseNum;
            option.textContent = `Case-${caseNum}`;
            select.appendChild(option);
        });
    }
}

function loadReportImage() {
    const caseNum = document.getElementById('reportCaseSelect').value;
    if (caseNum) {
        const reportPath = `${resultsPath}/ai_reports/Case-${caseNum}.png`;
        loadImageSrc(reportPath, document.getElementById('reportImage'));
    }
}

// Configuration Page
function loadConfig() {
    loadJSON(`${resultsPath}/run_config.json`).then(config => {
        if (config) {
            document.getElementById('configJson').textContent = JSON.stringify(config, null, 2);
        }
    });
}

// File Checker Page
async function loadFileChecker() {
    const expectedFiles = {
        'CSV Files': [
            'patient_metrics_summary.csv',
            'patient_confusion_matrices.csv',
            'model_comparison_stats.csv',
            'coverage_vs_performance.csv',
            'calibration_summary.csv',
            'cnn_uncertainty_patientlevel.csv'
        ],
        'Images': [
            'roc_curves_patient_level.png',
            'pr_curves_patient_level.png',
            'confusion_matrices_patient_level.png',
            'coverage_curve.png'
        ],
        'Configuration': ['run_config.json'],
        'Calibration Plots': [
            'calibration_plots/calibration_plot_patientlevel_RF_raw.png',
            'calibration_plots/calibration_plot_patientlevel_RF_calibrated.png',
            'calibration_plots/calibration_plot_patientlevel_XGB_raw.png',
            'calibration_plots/calibration_plot_patientlevel_XGB_calibrated.png',
            'calibration_plots/calibration_plot_patientlevel_CNN_raw.png',
            'calibration_plots/calibration_plot_patientlevel_CNN_calibrated.png'
        ],
        'SHAP Plots': ['shap_plots/shap_global_summary.png'],
        'AI Reports': ['ai_reports/index.csv']
    };
    
    let html = '';
    for (const [category, files] of Object.entries(expectedFiles)) {
        html += `<h3>${category}</h3>`;
        html += '<div class="table-container">';
        
        // Check each file
        for (const file of files) {
            const filepath = `${resultsPath}/${file}`;
            const exists = await checkFileExists(filepath);
            html += `<div class="file-status ${exists ? 'present' : 'missing'}">
                <span>${file}</span>
                <span>${exists ? '✓ Present' : '✗ Missing'}</span>
            </div>`;
        }
        
        html += '</div>';
    }
    
    document.getElementById('fileCheckerResults').innerHTML = html;
}

// Utility Functions
function loadCSV(url) {
    const cacheKey = url;
    if (dataCache[cacheKey]) {
        return Promise.resolve(dataCache[cacheKey]);
    }
    
    // Check if file was uploaded
    if (Object.keys(uploadedFiles).length > 0) {
        const relativePath = url.replace(resultsPath + '/', '');
        if (uploadedFiles[relativePath]) {
            return new Promise((resolve, reject) => {
                const file = uploadedFiles[relativePath];
                const reader = new FileReader();
                reader.onload = (e) => {
                    Papa.parse(e.target.result, {
                        header: true,
                        skipEmptyLines: true,
                        complete: (results) => {
                            dataCache[cacheKey] = results.data;
                            resolve(results.data);
                        },
                        error: reject
                    });
                };
                reader.onerror = reject;
                reader.readAsText(file);
            });
        }
    }
    
    // Fallback to fetch
    return fetch(url)
        .then(response => {
            if (!response.ok) throw new Error('File not found');
            return response.text();
        })
        .then(text => {
            return new Promise((resolve, reject) => {
                Papa.parse(text, {
                    header: true,
                    skipEmptyLines: true,
                    complete: (results) => {
                        dataCache[cacheKey] = results.data;
                        resolve(results.data);
                    },
                    error: reject
                });
            });
        })
        .catch(error => {
            console.warn(`Failed to load ${url}:`, error);
            return null;
        });
}

function loadJSON(url) {
    const cacheKey = url;
    if (dataCache[cacheKey]) {
        return Promise.resolve(dataCache[cacheKey]);
    }
    
    // Check if file was uploaded
    if (Object.keys(uploadedFiles).length > 0) {
        const relativePath = url.replace(resultsPath + '/', '');
        if (uploadedFiles[relativePath]) {
            return new Promise((resolve, reject) => {
                const file = uploadedFiles[relativePath];
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        dataCache[cacheKey] = data;
                        resolve(data);
                    } catch (err) {
                        reject(err);
                    }
                };
                reader.onerror = reject;
                reader.readAsText(file);
            });
        }
    }
    
    // Fallback to fetch
    return fetch(url)
        .then(response => {
            if (!response.ok) throw new Error('File not found');
            return response.json();
        })
        .then(data => {
            dataCache[cacheKey] = data;
            return data;
        })
        .catch(error => {
            console.warn(`Failed to load ${url}:`, error);
            return null;
        });
}

// Handle image loading errors
function handleImageError(imgElement, name) {
    imgElement.style.display = 'none';
    const errorDiv = document.getElementById(imgElement.id + 'Error');
    if (errorDiv) {
        errorDiv.style.display = 'block';
    }
}

// Load image from uploaded files or URL
function loadImageSrc(filePath, imgElement) {
    if (!imgElement) return;
    
    // Reset error state
    imgElement.style.display = 'block';
    const errorDiv = document.getElementById(imgElement.id + 'Error');
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
    
    // Check if file was uploaded
    if (Object.keys(uploadedFiles).length > 0) {
        // Try different path formats
        const filename = filePath.split('/').pop().split('\\').pop();
        const pathVariations = [
            filePath.replace(resultsPath + '/', '').replace(resultsPath + '\\', ''),
            filePath.replace(/^.*\//, '').replace(/^.*\\/, ''), // Just filename
            filename,
            filePath.split('/').pop(),
            filePath.split('\\').pop()
        ];
        
        // Normalize and add more variations
        const normalizedPath = filePath.replace(/\\/g, '/').replace(resultsPath + '/', '');
        pathVariations.push(normalizedPath);
        pathVariations.push(normalizedPath.replace(/\//g, '\\'));
        
        // Try to find the file
        let foundFile = null;
        for (const relativePath of pathVariations) {
            if (uploadedFiles[relativePath]) {
                foundFile = uploadedFiles[relativePath];
                break;
            }
        }
        
        if (foundFile) {
            const reader = new FileReader();
            reader.onload = (e) => {
                imgElement.src = e.target.result;
                imgElement.style.display = 'block';
                if (errorDiv) errorDiv.style.display = 'none';
            };
            reader.onerror = () => {
                handleImageError(imgElement, filePath);
            };
            reader.readAsDataURL(foundFile);
            return;
        }
        
        // File not found in uploaded files - try URL fallback
        imgElement.src = filePath;
        imgElement.onerror = function() {
            handleImageError(this, filePath);
        };
        return;
    }
    
    // Fallback to URL (for local file system or server)
    imgElement.src = filePath;
    imgElement.onerror = function() {
        handleImageError(this, filePath);
    };
}

function createTable(data) {
    if (!data || data.length === 0) return '<p>No data available</p>';
    
    const headers = Object.keys(data[0]);
    let html = '<table><thead><tr>';
    headers.forEach(header => {
        html += `<th>${header}</th>`;
    });
    html += '</tr></thead><tbody>';
    
    data.forEach(row => {
        html += '<tr>';
        headers.forEach(header => {
            html += `<td>${row[header] || ''}</td>`;
        });
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    return html;
}

function checkFileExists(url) {
    // Check uploaded files first
    if (Object.keys(uploadedFiles).length > 0) {
        const relativePath = url.replace(resultsPath + '/', '');
        return Promise.resolve(!!uploadedFiles[relativePath]);
    }
    
    // Fallback to fetch
    return fetch(url, { method: 'HEAD' })
        .then(response => response.ok)
        .catch(() => false);
}

