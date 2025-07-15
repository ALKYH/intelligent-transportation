import base64
import os

import psycopg2
from Crypto.Cipher import AES

# 人脸识别相关配置
FACE_RECOGNITION_DB_NAME: str = "app"  # 人脸识别数据库名
FACE_RECOGNITION_DB_USER: str = "postgres"  # 数据库用户名
FACE_RECOGNITION_DB_PASSWORD: str = "111"  # 数据库密码
FACE_RECOGNITION_DB_HOST: str = "113.47.146.57"  # 数据库主机地址
FACE_RECOGNITION_DB_PORT: int = 5432  # 数据库端口


def encrypt_data(data, key):
    cipher = AES.new(key, AES.MODE_EAX)
    nonce = cipher.nonce
    ciphertext, tag = cipher.encrypt_and_digest(data)
    return nonce + tag + ciphertext

def decrypt_data(encrypted_data, key):
    nonce = encrypted_data[:16]
    tag = encrypted_data[16:32]
    ciphertext = encrypted_data[32:]
    cipher = AES.new(key, AES.MODE_EAX, nonce=nonce)
    try:
        decrypted_data = cipher.decrypt_and_verify(ciphertext, tag)
        return decrypted_data
    except ValueError:
        print("解密失败：数据可能被篡改或密钥不正确。")
        return None

class Logger:
    def __init__(self, aes_key_path=None):
        self.conn = psycopg2.connect(
            dbname=FACE_RECOGNITION_DB_NAME,
            user=FACE_RECOGNITION_DB_USER,
            password=FACE_RECOGNITION_DB_PASSWORD,
            host=FACE_RECOGNITION_DB_HOST,
            port=FACE_RECOGNITION_DB_PORT
        )

        # 设置默认绝对路径
        if aes_key_path is None:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            aes_key_path = os.path.join(base_dir, "faceRecognition", "aes_key.bin")

        # 加载 AES 密钥
        with open(aes_key_path, 'rb') as f:
            self.aes_key = f.read()

    def execute_query(self, query, params=None):
        """执行 SQL 查询"""
        try:
            with self.conn.cursor() as cursor:
                cursor.execute(query, params)
                self.conn.commit()
                if query.strip().upper().startswith("SELECT"):
                    # 获取列名
                    columns = [desc[0] for desc in cursor.description]
                    # 将结果转换为字典列表
                    results = cursor.fetchall()
                    if results:
                        def convert_value(value):
                            if isinstance(value, memoryview):
                                return value.tobytes().decode('utf-8', errors='ignore')
                            elif hasattr(value, 'isoformat'):
                                return value.isoformat()
                            return value

                        return [dict(zip(columns, [convert_value(v) for v in row])) for row in results]
                    return []
                return None
        except Exception as e:
            print(f"数据库操作出错: {e}")
            self.conn.rollback()
            return None

    # road_surface_detection 表操作
    def create_road_surface_detection(self, file_data, file_type, disease_info):
        """创建道路表面检测记录"""
        query = "INSERT INTO road_surface_detection (file_data, file_type, disease_info) VALUES (%s, %s, %s) RETURNING id"
        return self.execute_query(query, (file_data, file_type, disease_info))

    def get_road_surface_detection(self, id=None):
        """获取道路表面检测记录"""
        if id:
            query = "SELECT * FROM road_surface_detection WHERE id = %s"
            return self.execute_query(query, (id,))
        else:
            query = "SELECT * FROM road_surface_detection"
            return self.execute_query(query)

    def update_road_surface_detection(self, id, file_data=None, file_type=None, disease_info=None, alarm_status=None):
        """更新道路表面检测记录"""
        updates = []
        params = []
        if file_data:
            updates.append("file_data = %s")
            params.append(file_data)
        if file_type:
            updates.append("file_type = %s")
            params.append(file_type)
        if disease_info:
            updates.append("disease_info = %s")
            params.append(disease_info)
        if alarm_status is not None:
            updates.append("alarm_status = %s")
            params.append(alarm_status)
        
        params.append(id)
        query = f"UPDATE road_surface_detection SET {', '.join(updates)} WHERE id = %s"
        return self.execute_query(query, params)

    def delete_road_surface_detection(self, id):
        """删除道路表面检测记录"""
        query = "DELETE FROM road_surface_detection WHERE id = %s"
        return self.execute_query(query, (id,))

    # malicious_attacks 表操作
    def create_malicious_attack(self, attack_info, face_image):
        """创建恶意攻击记录，人脸图片需先进行 Base64 编码再 AES 加密"""
        if isinstance(face_image, bytes):
            base64_image = base64.b64encode(face_image)
            encrypted_image = encrypt_data(base64_image, self.aes_key)
            query = "INSERT INTO malicious_attacks (attack_info, face_image) VALUES (%s, %s) RETURNING id"
            return self.execute_query(query, (attack_info, encrypted_image))
        else:
            print("输入的人脸图片格式不正确，应为 bytes 类型")
            return None

    def get_malicious_attacks(self, id=None):
        """获取恶意攻击记录，返回时对人脸图片进行解码和解密"""
        if id:
            query = "SELECT * FROM malicious_attacks WHERE id = %s"
            results = self.execute_query(query, (id,))
        else:
            query = "SELECT * FROM malicious_attacks"
            results = self.execute_query(query)
        
        decoded_results = []
        for row in results:
            if 'face_image' in row:
                decrypted_image = decrypt_data(row['face_image'], self.aes_key)
                if decrypted_image:
                    decoded_image = base64.b64decode(decrypted_image)
                    new_row = row.copy()
                    new_row['face_image'] = decoded_image
                    decoded_results.append(new_row)
                else:
                    decoded_results.append(row)
            else:
                decoded_results.append(row)
        return decoded_results

    def update_malicious_attack(self, id, attack_info=None, face_image=None):
        """更新恶意攻击记录，人脸图片需先进行 Base64 编码再 AES 加密"""
        updates = []
        params = []
        if attack_info:
            updates.append("attack_info = %s")
            params.append(attack_info)
        if face_image:
            if isinstance(face_image, bytes):
                base64_image = base64.b64encode(face_image)
                encrypted_image = encrypt_data(base64_image, self.aes_key)
                updates.append("face_image = %s")
                params.append(encrypted_image)
            else:
                print("输入的人脸图片格式不正确，应为 bytes 类型")
                return None
        
        params.append(id)
        query = f"UPDATE malicious_attacks SET {', '.join(updates)} WHERE id = %s"
        return self.execute_query(query, params)

    def delete_malicious_attack(self, id):
        """删除恶意攻击记录"""
        query = "DELETE FROM malicious_attacks WHERE id = %s"
        return self.execute_query(query, (id,))

    def __del__(self):
        """关闭数据库连接"""
        if self.conn:
            self.conn.close()

if __name__ == "__main__":
    logger = Logger()
    res = logger.get_road_surface_detection()
    print(res)