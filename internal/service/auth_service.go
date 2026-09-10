package service

import (
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"opshub/internal/model"
)

// Claims represents the JWT payload containing user identity and role.
type Claims struct {
	Username string `json:"username"`
	Role     string `json:"role"`
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
		"INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
		"admin",
		string(hash),
		model.RoleAdmin,
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

// Login validates user credentials against the database and returns a signed 24-hour JWT token.
func (s *AuthService) Login(username, password string) (string, error) {
	var (
		id       int64
		uName    string
		hash     string
		userRole string
	)

	err := s.db.QueryRow(
		"SELECT id, username, password_hash, role FROM users WHERE username = ?",
		username,
	).Scan(&id, &uName, &hash, &userRole)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", errors.New("invalid credentials")
		}
		return "", fmt.Errorf("query user failed: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
		return "", errors.New("invalid credentials")
	}

	now := time.Now()
	claims := Claims{
		Username: uName,
		Role:     userRole,
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
