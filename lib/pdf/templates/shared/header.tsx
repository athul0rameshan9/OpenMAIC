import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';

interface HeaderProps {
  title: string;
  subtitle?: string;
  date: string;
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#2563eb',
    borderBottomStyle: 'solid',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
  },
  date: {
    fontSize: 10,
    color: '#94a3b8',
  },
});

export function Header({ title, subtitle, date }: HeaderProps) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      <Text style={styles.date}>Generated: {date}</Text>
    </View>
  );
}
