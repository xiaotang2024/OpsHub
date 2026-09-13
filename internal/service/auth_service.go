package service

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"opshub/internal/database"
	"opshub/internal/model"
)

// Claims represents the JWT payload containing user identity, role, and permissions.
type Claims struct {
	Username    string   `json:"username"`
	Role        string   `json:"role"`
	Permissions []string `json:"permissions,omitempty"`
	jwt.RegisteredClaims
}

// AuthService handles administrative user bootstrapping, authentication, and JWT lifecycle.
type AuthService struct {
	db        *sql.DB
	jwtSecret string
}

// NewAuthService constructs a new AuthService instance.
func NewAuthService(db *sql.DB, jwtSecret string) *AuthService {
	return &AuthService{
		db:        db,
		jwtSecret: jwtSecret,
	}
}

// InitAdminIfNeeded checks if any user exists in the users table. If no users exist,
// it generates a secure random 16-character password, hashes it using bcrypt,
// stores user "admin" with RoleAdmin, and returns the raw unhashed password.
// If a user already exists, it returns an empty string without an error.
func (s *AuthService) InitAdminIfNeeded() (string, error) {
	var count int
	err := s.db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	if err != nil {
		return "", fmt.Errorf("check existing users failed: %w", err)
	}

	if count > 0 {
		return "", nil
	}

	rawPassword, err := generateSecurePassword(16)
	if err != nil {
		return "", fmt.Errorf("generate random password failed: %w", err)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(rawPassword), bcrypt.DefaultCost)
	if err != nil {
		return "", fmt.Errorf("hash password failed: %w", err)
	}

	_, err = s.db.Exec(
		"INSERT INTO users (username, password_hash, role, nickname, security_question, security_answer_hash) VALUES (?, ?, ?, ?, ?, ?)",
		"admin",
		string(hash),
		model.RoleAdmin,
		"系统管理员",
		"OpsHub 初始系统口令密保（答案为服务端首次启动生成的初始口令）",
		string(hash),
	)
	if err != nil {
		return "", fmt.Errorf("insert admin user failed: %w", err)
	}

	return rawPassword, nil
}

// InitAdmin is an alias for InitAdminIfNeeded.
func (s *AuthService) InitAdmin() (string, error) {
	return s.InitAdminIfNeeded()
}

// EnsureDefaultAdmin initializes the default admin account if not present.
func (s *AuthService) EnsureDefaultAdmin() (string, error) {
	return s.InitAdminIfNeeded()
}

// Login validates user credentials against the database and returns a signed 24-hour JWT token.
func (s *AuthService) Login(username, password string) (string, error) {
	var (
		id         int64
		uName      string
		hash       string
		userRole   string
		permStr    sql.NullString
		userStatus sql.NullString
	)

	err := s.db.QueryRow(
		"SELECT id, username, password_hash, role, permissions, status FROM users WHERE username = ?",
		username,
	).Scan(&id, &uName, &hash, &userRole, &permStr, &userStatus)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", errors.New("invalid credentials")
		}
		return "", fmt.Errorf("query user failed: %w", err)
	}

	status := userStatus.String
	if status == "" {
		status = model.UserStatusActive
	}
	if status == model.UserStatusDisabled {
		return "", errors.New("account is disabled")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
		return "", errors.New("invalid credentials")
	}

	var perms []string
	if permStr.Valid && strings.TrimSpace(permStr.String) != "" {
		_ = json.Unmarshal([]byte(permStr.String), &perms)
	}
	if len(perms) == 0 && userRole == model.RoleOperator {
		perms = model.DefaultOperatorPermissions
	}
	if perms == nil {
		perms = []string{}
	}

	now := time.Now()
	claims := Claims{
		Username:    uName,
		Role:        userRole,
		Permissions: perms,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Subject:   uName,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signedToken, err := token.SignedString([]byte(s.jwtSecret))
	if err != nil {
		return "", fmt.Errorf("sign jwt token failed: %w", err)
	}

	return signedToken, nil
}

// VerifyToken validates and parses a signed JWT token string, returning its claims.
func (s *AuthService) VerifyToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(s.jwtSecret), nil
	})
	if err != nil {
		return nil, fmt.Errorf("parse token failed: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token claims")
	}

	return claims, nil
}

// ChangePassword verifies the user's old password and updates it with the new password hash.
func (s *AuthService) ChangePassword(username, oldPassword, newPassword string) error {
	if strings.TrimSpace(newPassword) == "" {
		return errors.New("new password cannot be empty")
	}

	var hash string
	err := s.db.QueryRow(
		"SELECT password_hash FROM users WHERE username = ?",
		username,
	).Scan(&hash)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return errors.New("user not found")
		}
		return fmt.Errorf("query user failed: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(oldPassword)); err != nil {
		return errors.New("invalid old password")
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash new password failed: %w", err)
	}

	_, err = s.db.Exec(
		"UPDATE users SET password_hash = ? WHERE username = ?",
		string(newHash),
		username,
	)
	if err != nil {
		return fmt.Errorf("update user password failed: %w", err)
	}

	return nil
}

// ResetPassword sets a new password for a user without verifying the previous password.
func (s *AuthService) ResetPassword(username, newPassword string) error {
	if strings.TrimSpace(newPassword) == "" {
		return errors.New("new password cannot be empty")
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash new password failed: %w", err)
	}

	res, err := s.db.Exec(
		"UPDATE users SET password_hash = ? WHERE username = ?",
		string(newHash),
		username,
	)
	if err != nil {
		return fmt.Errorf("update user password failed: %w", err)
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("user not found")
	}

	return nil
}

// Register registers a new user with RoleOperator, hashed password, and security question.
func (s *AuthService) Register(username, password, nickname, email, securityQuestion, securityAnswer string) (*model.User, error) {
	username = strings.TrimSpace(username)
	nickname = strings.TrimSpace(nickname)
	email = strings.TrimSpace(email)
	securityQuestion = strings.TrimSpace(securityQuestion)
	securityAnswer = strings.TrimSpace(securityAnswer)

	if len(username) < 3 {
		return nil, errors.New("username must be at least 3 characters")
	}
	if len(password) < 6 {
		return nil, errors.New("password must be at least 6 characters")
	}
	if securityQuestion == "" {
		return nil, errors.New("security question cannot be empty")
	}
	if securityAnswer == "" {
		return nil, errors.New("security answer cannot be empty")
	}

	if nickname == "" {
		nickname = username
	}

	var exists int
	err := s.db.QueryRow("SELECT COUNT(*) FROM users WHERE username = ?", username).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("check username failed: %w", err)
	}
	if exists > 0 {
		return nil, errors.New("username already exists")
	}

	passHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password failed: %w", err)
	}

	normalizedAnswer := strings.ToLower(securityAnswer)
	answerHash, err := bcrypt.GenerateFromPassword([]byte(normalizedAnswer), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash security answer failed: %w", err)
	}

	permsBytes, err := json.Marshal(model.DefaultOperatorPermissions)
	if err != nil {
		return nil, fmt.Errorf("marshal default permissions failed: %w", err)
	}

	now := time.Now()
	res, err := s.db.Exec(
		`INSERT INTO users (username, password_hash, role, nickname, email, security_question, security_answer_hash, permissions, status, created_at, updated_at) 
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		username,
		string(passHash),
		model.RoleOperator,
		nickname,
		email,
		securityQuestion,
		string(answerHash),
		string(permsBytes),
		model.UserStatusActive,
		now,
		now,
	)
	if err != nil {
		if database.IsUniqueViolation(err) {
			return nil, errors.New("username already exists")
		}
		return nil, fmt.Errorf("insert user failed: %w", err)
	}

	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}

	return &model.User{
		ID:               id,
		Username:         username,
		Role:             model.RoleOperator,
		Nickname:         nickname,
		Email:            email,
		SecurityQuestion: securityQuestion,
		Permissions:      model.DefaultOperatorPermissions,
		Status:           model.UserStatusActive,
		CreatedAt:        now,
		UpdatedAt:        now,
	}, nil
}

// GetSecurityQuestion retrieves the security question for a given username.
func (s *AuthService) GetSecurityQuestion(username string) (string, error) {
	username = strings.TrimSpace(username)
	if username == "" {
		return "", errors.New("username cannot be empty")
	}

	var question string
	err := s.db.QueryRow("SELECT security_question FROM users WHERE username = ?", username).Scan(&question)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", errors.New("user not found")
		}
		return "", fmt.Errorf("query security question failed: %w", err)
	}

	if strings.TrimSpace(question) == "" {
		return "", errors.New("no security question configured for this user")
	}

	return question, nil
}

// ResetPasswordWithSecurityAnswer verifies the answer to the security question and resets the password.
func (s *AuthService) ResetPasswordWithSecurityAnswer(username, answer, newPassword string) error {
	username = strings.TrimSpace(username)
	answer = strings.TrimSpace(answer)

	if username == "" {
		return errors.New("username cannot be empty")
	}
	if answer == "" {
		return errors.New("security answer cannot be empty")
	}
	if len(newPassword) < 6 {
		return errors.New("new password must be at least 6 characters")
	}

	var answerHash string
	err := s.db.QueryRow("SELECT security_answer_hash FROM users WHERE username = ?", username).Scan(&answerHash)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return errors.New("user not found")
		}
		return fmt.Errorf("query user failed: %w", err)
	}

	if strings.TrimSpace(answerHash) == "" {
		return errors.New("no security question configured for this user")
	}

	normalizedAnswer := strings.ToLower(answer)
	if err := bcrypt.CompareHashAndPassword([]byte(answerHash), []byte(normalizedAnswer)); err != nil {
		return errors.New("incorrect security answer")
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash new password failed: %w", err)
	}

	_, err = s.db.Exec("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?", string(newHash), username)
	if err != nil {
		return fmt.Errorf("update user password failed: %w", err)
	}

	return nil
}

// GetProfile retrieves detailed profile information for a user.
func (s *AuthService) GetProfile(username string) (*model.User, error) {
	username = strings.TrimSpace(username)
	if username == "" {
		return nil, errors.New("username cannot be empty")
	}

	var u model.User
	var permStr sql.NullString
	var statusStr sql.NullString
	err := s.db.QueryRow(
		"SELECT id, username, role, nickname, email, avatar, security_question, permissions, status, created_at, updated_at FROM users WHERE username = ?",
		username,
	).Scan(&u.ID, &u.Username, &u.Role, &u.Nickname, &u.Email, &u.Avatar, &u.SecurityQuestion, &permStr, &statusStr, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("user not found")
		}
		return nil, fmt.Errorf("query user profile failed: %w", err)
	}

	if statusStr.Valid && statusStr.String != "" {
		u.Status = statusStr.String
	} else {
		u.Status = model.UserStatusActive
	}

	if permStr.Valid && strings.TrimSpace(permStr.String) != "" {
		_ = json.Unmarshal([]byte(permStr.String), &u.Permissions)
	}
	if len(u.Permissions) == 0 && u.Role == model.RoleOperator {
		u.Permissions = model.DefaultOperatorPermissions
	}
	if u.Permissions == nil {
		u.Permissions = []string{}
	}

	return &u, nil
}

// UpdateProfile updates the nickname, email, and optionally avatar for a given user.
func (s *AuthService) UpdateProfile(username, nickname, email string, avatar *string) error {
	username = strings.TrimSpace(username)
	nickname = strings.TrimSpace(nickname)
	email = strings.TrimSpace(email)

	if username == "" {
		return errors.New("username cannot be empty")
	}
	if nickname == "" {
		nickname = username
	}

	var res sql.Result
	var err error

	if avatar != nil {
		res, err = s.db.Exec(
			"UPDATE users SET nickname = ?, email = ?, avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?",
			nickname,
			email,
			strings.TrimSpace(*avatar),
			username,
		)
	} else {
		res, err = s.db.Exec(
			"UPDATE users SET nickname = ?, email = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?",
			nickname,
			email,
			username,
		)
	}
	if err != nil {
		return fmt.Errorf("update user profile failed: %w", err)
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("user not found")
	}

	return nil
}

// SetSecurityQuestion updates the security question and answer for a user.
func (s *AuthService) SetSecurityQuestion(username, question, answer string) error {
	username = strings.TrimSpace(username)
	question = strings.TrimSpace(question)
	answer = strings.TrimSpace(answer)

	if username == "" {
		return errors.New("username cannot be empty")
	}
	if question == "" || answer == "" {
		return errors.New("security question and answer cannot be empty")
	}

	normalizedAnswer := strings.ToLower(answer)
	answerHash, err := bcrypt.GenerateFromPassword([]byte(normalizedAnswer), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash answer failed: %w", err)
	}

	res, err := s.db.Exec(
		"UPDATE users SET security_question = ?, security_answer_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?",
		question,
		string(answerHash),
		username,
	)
	if err != nil {
		return fmt.Errorf("update security question failed: %w", err)
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("user not found")
	}

	return nil
}

// generateSecurePassword generates a cryptographically secure random alphanumeric string of length n.
func generateSecurePassword(length int) (string, error) {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	result := make([]byte, length)
	charsetLen := big.NewInt(int64(len(charset)))

	for i := 0; i < length; i++ {
		num, err := rand.Int(rand.Reader, charsetLen)
		if err != nil {
			return "", err
		}
		result[i] = charset[num.Int64()]
	}

	return string(result), nil
}
