import sys
import os
import json
from pathlib import Path
from PIL import Image
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, 
    QPushButton, QFileDialog, QComboBox, QLabel, QListWidget, 
    QProgressBar, QMessageBox, QFrame
)
from PyQt6.QtCore import Qt, QThread, pyqtSignal

class ImageProcessor(QThread):
    progress = pyqtSignal(int)
    log = pyqtSignal(str)
    finished_batch = pyqtSignal()

    def __init__(self, source_dir, output_dir, brand_config, brand_name):
        super().__init__()
        self.source_dir = Path(source_dir)
        self.output_dir = Path(output_dir)
        self.brand_config = brand_config
        self.brand_name = brand_name
        self.is_running = True

    def run(self):
        images = list(self.source_dir.glob("*.[jJ][pP][gG]")) + \
                 list(self.source_dir.glob("*.[pP][nN][gG]")) + \
                 list(self.source_dir.glob("*.[jJ][pP][eE][gG]"))
        
        total = len(images)
        if total == 0:
            self.log.emit("错误: 文件夹中未找到图片。")
            self.finished_batch.emit()
            return

        os.makedirs(self.output_dir, exist_ok=True)
        
        brand_logos = self.brand_config.get(self.brand_name, {})
        
        for i, img_path in enumerate(images):
            if not self.is_running:
                break
            
            try:
                with Image.open(img_path) as img:
                    w, h = img.size
                    size_key = f"{w}*{h}"
                    
                    self.log.emit(f"处理中: {img_path.name} ({size_key})")
                    
                    logo_path_str = brand_logos.get(size_key)
                    
                    if not logo_path_str or not os.path.exists(logo_path_str):
                        self.log.emit(f"  [跳过] 未找到匹配尺寸的 Logo: {size_key}")
                        self.progress.emit(int((i + 1) / total * 100))
                        continue
                    
                    # 加载并合成
                    logo = Image.open(logo_path_str).convert("RGBA")
                    # 如果原图没有 alpha 通道，转为 RGB 再进行复合（如果是 JPG）
                    if img.mode != "RGBA":
                        background = img.convert("RGBA")
                    else:
                        background = img.copy()
                    
                    # 将 Logo 叠加到背景上
                    background.paste(logo, (0, 0), logo)
                    
                    # 保存结果
                    out_path = self.output_dir / img_path.name
                    if img_path.suffix.lower() in ['.jpg', '.jpeg']:
                        background.convert("RGB").save(out_path, quality=95)
                    else:
                        background.save(out_path)
                    
                    self.log.emit(f"  [成功] 已保存至 {out_path.name}")
                    
            except Exception as e:
                self.log.emit(f"  [错误] 处理失败 {img_path.name}: {str(e)}")
            
            self.progress.emit(int((i + 1) / total * 100))
        
        self.finished_batch.emit()

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("LogoMaster - 自动化 Logo 叠加工具")
        self.setMinimumSize(800, 600)
        
        # 加载配置
        self.load_config()
        
        self.setup_ui()

    def load_config(self):
        # 默认品牌结构，实际使用中可从 JSON 加载
        config_file = Path("config.json")
        if config_file.exists():
            with open(config_file, 'r', encoding='utf-8') as f:
                self.config = json.load(f)
        else:
            # 默认演示配置
            self.config = {
                "芬腾": {
                    "1200*1200": "logos/fenteng/1200x1200.png",
                    "800*1200": "logos/fenteng/800x1200.png"
                },
                "古今": {
                    "1200*1200": "logos/gujin/1200x1200.png"
                },
                "皮尔卡丹": {}
            }

    def setup_ui(self):
        main_layout = QVBoxLayout()
        central_widget = QWidget()
        central_widget.setLayout(main_layout)
        self.setCentralWidget(central_widget)

        # ---------------- 品牌选择 ----------------
        brand_layout = QHBoxLayout()
        brand_layout.addWidget(QLabel("选择品牌:"))
        self.brand_combo = QComboBox()
        self.brand_combo.addItems(list(self.config.keys()))
        brand_layout.addWidget(self.brand_combo)
        brand_layout.addStretch()
        main_layout.addLayout(brand_layout)

        # ---------------- 路径选择 ----------------
        path_layout = QVBoxLayout()
        
        # 输入
        input_box = QHBoxLayout()
        input_box.addWidget(QLabel("源文件夹:"))
        self.input_edit = QLabel("未选择")
        self.input_edit.setFrameStyle(QFrame.Shape.StyledPanel | QFrame.Shadow.Sunken)
        input_box.addWidget(self.input_edit, 1)
        btn_input = QPushButton("浏览...")
        btn_input.clicked.connect(self.select_input)
        input_box.addWidget(btn_input)
        path_layout.addLayout(input_box)

        # 输出
        output_box = QHBoxLayout()
        output_box.addWidget(QLabel("导出文件夹:"))
        self.output_edit = QLabel("未选择")
        self.output_edit.setFrameStyle(QFrame.Shape.StyledPanel | QFrame.Shadow.Sunken)
        output_box.addWidget(self.output_edit, 1)
        btn_output = QPushButton("浏览...")
        btn_output.clicked.connect(self.select_output)
        output_box.addWidget(btn_output)
        path_layout.addLayout(output_box)
        
        main_layout.addLayout(path_layout)

        # ---------------- 日志列表 ----------------
        main_layout.addWidget(QLabel("处理日志:"))
        self.log_list = QListWidget()
        main_layout.addWidget(self.log_list)

        # ---------------- 进度条 ----------------
        self.progress_bar = QProgressBar()
        main_layout.addWidget(self.progress_bar)

        # ---------------- 按钮 ----------------
        self.btn_start = QPushButton("开始自动化批处理")
        self.btn_start.setFixedHeight(50)
        self.btn_start.setStyleSheet("background-color: #0078D4; color: white; font-weight: bold; font-size: 14px;")
        self.btn_start.clicked.connect(self.start_processing)
        main_layout.addWidget(self.btn_start)

    def select_input(self):
        dir_path = QFileDialog.getExistingDirectory(self, "选择源图片文件夹")
        if dir_path:
            self.input_edit.setText(dir_path)

    def select_output(self):
        dir_path = QFileDialog.getExistingDirectory(self, "选择目标保存文件夹")
        if dir_path:
            self.output_edit.setText(dir_path)

    def start_processing(self):
        in_path = self.input_edit.text()
        out_path = self.output_edit.text()
        brand = self.brand_combo.currentText()

        if in_path == "未选择" or out_path == "未选择":
            QMessageBox.warning(self, "提示", "请先选择输入和输出文件夹")
            return

        self.btn_start.setEnabled(False)
        self.log_list.clear()
        self.log_list.addItem(f">>> 开始处理品牌 [{brand}]")
        
        self.processor = ImageProcessor(in_path, out_path, self.config, brand)
        self.processor.log.connect(self.add_log)
        self.processor.progress.connect(self.progress_bar.setValue)
        self.processor.finished_batch.connect(self.on_finished)
        self.processor.start()

    def add_log(self, text):
        self.log_list.addItem(text)
        self.log_list.scrollToBottom()

    def on_finished(self):
        self.btn_start.setEnabled(True)
        QMessageBox.information(self, "完成", "批量处理已结束！")

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())
