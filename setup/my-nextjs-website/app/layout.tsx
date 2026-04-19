import React from 'react';
import './globals.css';

const Layout = ({ children }) => {
    return (
        <html lang="en">
            <head>
                <title>My Next.js Website</title>
            </head>
            <body>
                <header>
                    <h1>Welcome to My Next.js Website</h1>
                </header>
                <main>{children}</main>
                <footer>
                    <p>&copy; {new Date().getFullYear()} My Next.js Website</p>
                </footer>
            </body>
        </html>
    );
};

export default Layout;